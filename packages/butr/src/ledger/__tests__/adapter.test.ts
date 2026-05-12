import { describe, expect, it, vi } from "vitest";
import type {
  EthAppConstructor,
  EthAppLike,
  TransportFactory,
  TransportLike,
} from "../adapter";
import { createLedgerAdapter } from "../adapter";

const FAKE_ADDRESSES = [
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "0xb1c97082d7308c47e2D29Ee5BdB058Fe6c6c0c59",
  "0xc1a5d63d0eb1c52e0e0006c3a7a3a3d52a3a3a3a",
] as const;

const buildFakeEthCtor = (addresses: ReadonlyArray<string> = FAKE_ADDRESSES): EthAppConstructor => {
  return class FakeEth implements EthAppLike {
    constructor(private readonly _transport: unknown) {
      void _transport;
    }
    async getAddress(path: string) {
      // Parse the trailing index off the path (e.g. "44'/60'/0'/0/2" → 2)
      const idx = Number.parseInt(path.split("/").pop() ?? "0", 10);
      const address = addresses[idx] ?? addresses[0];
      return { address: address ?? "0x0", publicKey: "0xpubkey" };
    }
    async signPersonalMessage(_path: string, _hex: string) {
      return { r: "a".repeat(64), s: "b".repeat(64), v: 27 };
    }
    async signTransaction(_path: string, _hex: string) {
      return { r: "ff", s: "ee", v: "1b" };
    }
  };
};

const buildFakeTransport = (): { factory: TransportFactory; lastTransport: TransportLike | null } => {
  let lastTransport: TransportLike | null = null;
  const factory: TransportFactory = {
    async create() {
      const t: TransportLike = {
        close: vi.fn().mockResolvedValue(undefined),
      };
      lastTransport = t;
      return t;
    },
  };
  return {
    factory,
    get lastTransport() {
      return lastTransport;
    },
  };
};

describe("createLedgerAdapter", () => {
  it("builds an adapter with conservative defaults", async () => {
    const { factory } = buildFakeTransport();
    const adapter = await createLedgerAdapter({
      eth: buildFakeEthCtor(),
      transport: factory,
    });

    expect(adapter.id).toBe("ledger");
    expect(adapter.name).toBe("Ledger");
    expect(adapter.chainPlatform).toBe("evm");
    expect(adapter.capabilities.signMessage).toBe(true);
    expect(adapter.capabilities.sendTransaction).toBe(false);
    expect(adapter.capabilities.getBalance).toBe(false);
    expect(adapter.capabilities.subscribe).toBe(false);
    expect(adapter.capabilities.switchChain).toBe(true);
  });

  it("connect() opens transport + fetches first address", async () => {
    const { factory } = buildFakeTransport();
    const adapter = await createLedgerAdapter({
      eth: buildFakeEthCtor(),
      transport: factory,
    });

    await adapter.connect();
    const account = await adapter.getAccount();
    expect(account?.walletAddress).toBe(FAKE_ADDRESSES[0]);
    expect(account?.chain.id).toBe("eip155:1");
  });

  it("disconnect() closes the transport and clears state", async () => {
    const fake = buildFakeTransport();
    const adapter = await createLedgerAdapter({
      eth: buildFakeEthCtor(),
      transport: fake.factory,
    });

    await adapter.connect();
    const transport = fake.lastTransport;
    expect(transport).not.toBeNull();

    await adapter.disconnect?.();
    expect(transport?.close).toHaveBeenCalled();

    const account = await adapter.getAccount();
    expect(account).toBeNull();
  });

  it("getAccounts() walks the derivation path up to accountCount", async () => {
    const { factory } = buildFakeTransport();
    const adapter = await createLedgerAdapter({
      accountCount: 3,
      eth: buildFakeEthCtor(),
      transport: factory,
    });

    await adapter.connect();
    const accounts = await adapter.getAccounts!();
    expect(accounts.map((a) => a.walletAddress)).toEqual([...FAKE_ADDRESSES]);
  });

  it("switchChain() updates the chain id on subsequent getAccount() calls", async () => {
    const { factory } = buildFakeTransport();
    const adapter = await createLedgerAdapter({
      eth: buildFakeEthCtor(),
      transport: factory,
    });

    await adapter.connect();
    await adapter.switchChain({
      id: "eip155:137",
      name: "Polygon",
      namespace: "eip155",
      reference: "137",
    });
    const account = await adapter.getAccount();
    expect(account?.chain.id).toBe("eip155:137");
    expect(account?.chain.reference).toBe("137");
  });

  it("switchChain() rejects non-EVM chains", async () => {
    const { factory } = buildFakeTransport();
    const adapter = await createLedgerAdapter({
      eth: buildFakeEthCtor(),
      transport: factory,
    });

    await expect(
      adapter.switchChain({
        id: "solana:mainnet",
        name: "Solana",
        namespace: "solana",
        reference: "mainnet",
      }),
    ).rejects.toThrow(/non-EVM chain/);
  });

  it("signMessage() returns a 65-byte (r||s||v) signature", async () => {
    const { factory } = buildFakeTransport();
    const adapter = await createLedgerAdapter({
      eth: buildFakeEthCtor(),
      transport: factory,
    });

    await adapter.connect();
    const result = await adapter.signMessage(new TextEncoder().encode("hello"));
    expect(result.signature).toBeInstanceOf(Uint8Array);
    expect(result.signature.length).toBe(65);
    // First 32 bytes are r (0xaa repeated), next 32 are s (0xbb), last byte is v (0x1b = 27)
    expect(result.signature[0]).toBe(0xaa);
    expect(result.signature[32]).toBe(0xbb);
    expect(result.signature[64]).toBe(0x1b);
  });

  it("signMessage() with a non-active account walks paths to find it", async () => {
    const { factory } = buildFakeTransport();
    const adapter = await createLedgerAdapter({
      accountCount: 3,
      eth: buildFakeEthCtor(),
      transport: factory,
    });

    await adapter.connect();
    const result = await adapter.signMessage(new TextEncoder().encode("hello"), {
      chain: { id: "eip155:1", name: "Ethereum", namespace: "eip155", reference: "1" },
      id: "eip155:1:" + (FAKE_ADDRESSES[2] ?? "0x0").toLowerCase(),
      walletAddress: FAKE_ADDRESSES[2] ?? "0x0",
    });
    expect(result.signature.length).toBe(65);
  });

  it("signMessage() throws when the address isn't on any known path", async () => {
    const { factory } = buildFakeTransport();
    const adapter = await createLedgerAdapter({
      accountCount: 2,
      eth: buildFakeEthCtor(),
      transport: factory,
    });

    await adapter.connect();
    await expect(
      adapter.signMessage(new TextEncoder().encode("hello"), {
        chain: { id: "eip155:1", name: "Ethereum", namespace: "eip155", reference: "1" },
        id: "eip155:1:0xdeadbeef",
        walletAddress: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      }),
    ).rejects.toThrow(/not found on this device/);
  });

  it("sendTx() / sendTxToChain() / getBalance() / getTransactionReceipt() reject", async () => {
    const { factory } = buildFakeTransport();
    const adapter = await createLedgerAdapter({
      eth: buildFakeEthCtor(),
      transport: factory,
    });

    await expect(adapter.sendTx({})).rejects.toThrow(/sendTx not supported/);
    await expect(adapter.sendTxToChain({}, "137")).rejects.toThrow(/sendTxToChain not supported/);
    await expect(adapter.getBalance()).rejects.toThrow(/getBalance not supported/);
    await expect(adapter.getTransactionReceipt("0x0")).rejects.toThrow(
      /getTransactionReceipt not supported/,
    );
  });
});
