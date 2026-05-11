import { describe, expect, it, vi } from "vitest";
import type { Eip1193Listener, Eip1193Provider, Eip6963ProviderInfo } from "../eip1193";
import {
  buildEvmAdapter,
  bytesToHex,
  chainIdDecimalToHex,
  chainIdHexToDecimal,
  formatEther,
  hexToBytes,
} from "../eip6963-adapter";

const INFO: Eip6963ProviderInfo = {
  icon: "data:image/svg+xml;base64,...",
  name: "Mock EIP-6963 Wallet",
  rdns: "io.mock.wallet",
  uuid: "uuid-1",
};

type MockProviderHandle = Eip1193Provider & {
  emit: (event: string, ...args: ReadonlyArray<unknown>) => void;
  requests: Array<{ method: string; params?: unknown }>;
  setHandler: (method: string, handler: (params: unknown) => unknown) => void;
};

const createMockProvider = (): MockProviderHandle => {
  const listeners = new Map<string, Set<Eip1193Listener>>();
  const handlers = new Map<string, (params: unknown) => unknown>();
  const requests: Array<{ method: string; params?: unknown }> = [];

  return {
    emit(event, ...args) {
      const set = listeners.get(event);
      if (!set) {
        return;
      }
      for (const listener of set) {
        listener(...args);
      }
    },
    on(event, listener) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(listener);
    },
    removeListener(event, listener) {
      listeners.get(event)?.delete(listener);
    },
    request({ method, params }) {
      requests.push({ method, params });
      const handler = handlers.get(method);
      if (handler) {
        return Promise.resolve(handler(params));
      }
      return Promise.resolve(undefined);
    },
    requests,
    setHandler(method, handler) {
      handlers.set(method, handler);
    },
  };
};

describe("hex helpers", () => {
  it("round-trips bytes through hex", () => {
    // 0xde 0xad 0xbe 0xef in decimal; oxlint + oxfmt disagree on hex
    // literal case, so use decimal here to keep both happy.
    const bytes = new Uint8Array([222, 173, 190, 239]);
    expect(bytesToHex(bytes)).toBe("0xdeadbeef");
    expect(hexToBytes("0xdeadbeef")).toEqual(bytes);
    expect(hexToBytes("deadbeef")).toEqual(bytes);
  });

  it("converts chain ids between hex and decimal", () => {
    expect(chainIdHexToDecimal("0x1")).toBe("1");
    expect(chainIdHexToDecimal("0x89")).toBe("137");
    expect(chainIdDecimalToHex("1")).toBe("0x1");
    expect(chainIdDecimalToHex("137")).toBe("0x89");
  });

  it("formats wei to ether, trimming trailing zeros", () => {
    expect(formatEther(0n)).toBe("0");
    expect(formatEther(1_000_000_000_000_000_000n)).toBe("1");
    expect(formatEther(1_500_000_000_000_000_000n)).toBe("1.5");
    expect(formatEther(123_456_000_000_000_000_000n)).toBe("123.456");
    // 1 wei = 0.000000000000000001 ETH
    expect(formatEther(1n)).toBe("0.000000000000000001");
  });
});

describe("buildEvmAdapter", () => {
  it("uses rdns as the connector id and the EIP-6963 info as the name", () => {
    const provider = createMockProvider();
    const adapter = buildEvmAdapter(INFO, provider);
    expect(adapter.id).toBe("io.mock.wallet");
    expect(adapter.name).toBe("Mock EIP-6963 Wallet");
    expect(adapter.chainPlatform).toBe("evm");
  });

  it("connect() calls eth_requestAccounts", async () => {
    const provider = createMockProvider();
    provider.setHandler("eth_requestAccounts", () => ["0xabc"]);
    const adapter = buildEvmAdapter(INFO, provider);

    await adapter.connect();
    expect(provider.requests).toContainEqual({ method: "eth_requestAccounts", params: undefined });
  });

  it("getAccount() returns null when no accounts are exposed", async () => {
    const provider = createMockProvider();
    provider.setHandler("eth_accounts", () => []);
    const adapter = buildEvmAdapter(INFO, provider);
    expect(await adapter.getAccount()).toBeNull();
  });

  it("getAccount() returns the first account with a CAIP-2 chain", async () => {
    const provider = createMockProvider();
    provider.setHandler("eth_accounts", () => ["0xC0FFEE"]);
    provider.setHandler("eth_chainId", () => "0x89"); // Polygon (137)

    const adapter = buildEvmAdapter(INFO, provider);
    const account = await adapter.getAccount();

    expect(account).not.toBeNull();
    expect(account?.chain.id).toBe("eip155:137");
    expect(account?.chain.namespace).toBe("eip155");
    expect(account?.chain.reference).toBe("137");
    expect(account?.walletAddress).toBe("0xC0FFEE");
    expect(account?.id).toBe("eip155:137:0xc0ffee");
  });

  it("getAccounts() returns every exposed address with the same chain", async () => {
    const provider = createMockProvider();
    provider.setHandler("eth_accounts", () => ["0xAAA", "0xBBB"]);
    provider.setHandler("eth_chainId", () => "0x1");

    const adapter = buildEvmAdapter(INFO, provider);
    const accounts = await adapter.getAccounts();

    expect(accounts).toHaveLength(2);
    expect(accounts[0]?.walletAddress).toBe("0xAAA");
    expect(accounts[1]?.walletAddress).toBe("0xBBB");
    expect(accounts.every((a) => a.chain.id === "eip155:1")).toBe(true);
  });

  it("switchChain() sends wallet_switchEthereumChain with hex chainId", async () => {
    const provider = createMockProvider();
    const adapter = buildEvmAdapter(INFO, provider);

    await adapter.switchChain({
      id: "eip155:137",
      name: "Polygon",
      namespace: "eip155",
      reference: "137",
    });

    expect(provider.requests).toContainEqual({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x89" }],
    });
  });

  it("signMessage() round-trips a Uint8Array through personal_sign", async () => {
    const provider = createMockProvider();
    provider.setHandler("eth_accounts", () => ["0xAAA"]);
    provider.setHandler("personal_sign", () => "0xdeadbeef");

    const adapter = buildEvmAdapter(INFO, provider);
    const msg = new Uint8Array([0x01, 0x02, 0x03]);
    const result = await adapter.signMessage(msg);

    expect(provider.requests).toContainEqual({
      method: "personal_sign",
      params: ["0x010203", "0xAAA"],
    });
    expect(result.signature).toEqual(new Uint8Array([222, 173, 190, 239]));
    expect(result.signedMessage).toBe(msg);
  });

  it("sendTxToChain() switches chain first when needed, then sends", async () => {
    const provider = createMockProvider();
    provider.setHandler("eth_chainId", () => "0x1"); // currently on mainnet
    provider.setHandler("eth_sendTransaction", () => "0xtxhash");
    const switchCb = vi.fn();

    const adapter = buildEvmAdapter(INFO, provider);
    const hash = await adapter.sendTxToChain({}, "137", switchCb);

    expect(switchCb).toHaveBeenCalledTimes(1);
    expect(provider.requests).toContainEqual({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x89" }],
    });
    expect(hash).toBe("0xtxhash");
  });

  it("sendTxToChain() skips the switch when already on the target chain", async () => {
    const provider = createMockProvider();
    provider.setHandler("eth_chainId", () => "0x89");
    provider.setHandler("eth_sendTransaction", () => "0xhash");
    const switchCb = vi.fn();

    const adapter = buildEvmAdapter(INFO, provider);
    await adapter.sendTxToChain({}, "137", switchCb);

    expect(switchCb).not.toHaveBeenCalled();
    expect(provider.requests.some((r) => r.method === "wallet_switchEthereumChain")).toBe(false);
  });

  it("getTransactionReceipt() maps EIP-1193 status to butr's enum", async () => {
    const provider = createMockProvider();
    const adapter = buildEvmAdapter(INFO, provider);

    provider.setHandler("eth_getTransactionReceipt", () => null);
    const pending = await adapter.getTransactionReceipt("0x1");
    expect(pending.status).toBe("Pending");

    provider.setHandler("eth_getTransactionReceipt", () => ({ status: "0x1" }));
    const success = await adapter.getTransactionReceipt("0x1");
    expect(success.status).toBe("Success");

    provider.setHandler("eth_getTransactionReceipt", () => ({ status: "0x0" }));
    const error = await adapter.getTransactionReceipt("0x1");
    expect(error.status).toBe("Error");
  });

  it("getBalance() reads native ETH and formats to 18 decimals", async () => {
    const provider = createMockProvider();
    provider.setHandler("eth_accounts", () => ["0xAAA"]);
    provider.setHandler("eth_getBalance", () => "0x0de0b6b3a7640000"); // 1 ETH

    const adapter = buildEvmAdapter(INFO, provider);
    const balance = await adapter.getBalance();

    expect(balance.decimals).toBe(18);
    expect(balance.symbol).toBe("ETH");
    expect(balance.value).toBe(1_000_000_000_000_000_000n);
    expect(balance.formatted).toBe("1");
  });

  it("disconnect() ignores wallets that don't implement wallet_revokePermissions", async () => {
    const provider = createMockProvider();
    provider.setHandler("wallet_revokePermissions", () => {
      throw new Error("method not supported");
    });

    const adapter = buildEvmAdapter(INFO, provider);
    // Should not throw — disconnect swallows wallet errors.
    await expect(adapter.disconnect?.()).resolves.toBeUndefined();
  });

  it("subscribe() bridges accountsChanged into an accountChanged event", async () => {
    const provider = createMockProvider();
    provider.setHandler("eth_chainId", () => "0x1");

    const adapter = buildEvmAdapter(INFO, provider);
    const listener = vi.fn();
    const unsub = adapter.subscribe?.(listener);

    // Fire the wallet event and wait one microtask for the internal
    // eth_chainId resolution.
    provider.emit("accountsChanged", ["0xNEW"]);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        account: expect.objectContaining({ walletAddress: "0xNEW" }),
        type: "accountChanged",
      }),
    );
    unsub?.();
  });

  it("subscribe() bridges empty-accounts to disconnected", () => {
    const provider = createMockProvider();
    const adapter = buildEvmAdapter(INFO, provider);
    const listener = vi.fn();
    const unsub = adapter.subscribe?.(listener);

    provider.emit("accountsChanged", []);

    expect(listener).toHaveBeenCalledWith({ type: "disconnected" });
    unsub?.();
  });

  it("subscribe() returns an unsubscribe that detaches every listener", () => {
    const provider = createMockProvider();
    const adapter = buildEvmAdapter(INFO, provider);
    const listener = vi.fn();
    const unsub = adapter.subscribe?.(listener);

    unsub?.();
    provider.emit("accountsChanged", ["0xNEW"]);
    provider.emit("chainChanged", "0x89");
    provider.emit("disconnect");

    expect(listener).not.toHaveBeenCalled();
  });
});
