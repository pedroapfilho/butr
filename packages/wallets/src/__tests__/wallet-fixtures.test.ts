// Per-wallet fixture tests: each describe block pins behaviour we've
// verified against the real wallet at the date shown. These tests
// simulate the wallet's responses (error codes, picker behaviour)
// rather than driving a real extension — that's Strategy A in the
// testing matrix. Real-wallet Playwright coverage (Strategy C) would
// live in `tests/e2e/` once wired.
//
// When a wallet changes its behaviour upstream (new error code,
// different fallback path), update the test AND
// `RDNS_WITH_REQUEST_ACCOUNTS` in `eip6963-adapter.ts` together.

import { describe, expect, it } from "vitest";
import type { Eip1193Provider, Eip6963ProviderInfo } from "@butr/evm";
import { buildEvmAdapter } from "@butr/evm";

const baseInfo = (rdns: string, name: string): Eip6963ProviderInfo => ({
  icon: "data:image/svg+xml;base64,Zm9v",
  name,
  rdns,
  uuid: `${rdns}-uuid`,
});

type MockResponse = () => Promise<unknown> | unknown;
type MockProvider = Eip1193Provider & { requests: Array<{ method: string }> };

const createMockProvider = (responses: Record<string, MockResponse>): MockProvider => {
  const requests: Array<{ method: string }> = [];
  return {
    on() {},
    removeListener() {},
    async request({ method }) {
      requests.push({ method });
      const handler = responses[method];
      if (!handler) {
        throw new Error(`[test] unmocked: ${method}`);
      }
      return handler();
    },
    requests,
  } as MockProvider;
};

describe("EVM wallet fixtures — known quirks (Strategy A)", () => {
  describe("MetaMask (io.metamask)", () => {
    // Verified May 2026. The only EVM wallet whose
    // `wallet_requestPermissions` actually reopens a picker.
    const info = baseInfo("io.metamask", "MetaMask");

    it("wallet_requestPermissions resolves — no fallback fires", async () => {
      const provider = createMockProvider({
        wallet_requestPermissions: () => [{ parentCapability: "eth_accounts" }],
      });
      const adapter = buildEvmAdapter(info, provider);
      await adapter.requestAccounts?.();
      expect(provider.requests.map((r) => r.method)).toEqual(["wallet_requestPermissions"]);
    });

    it("capabilities.requestAccounts is true (allow-listed)", () => {
      const adapter = buildEvmAdapter(info, createMockProvider({}));
      expect(adapter.capabilities.requestAccounts).toBe(true);
    });
  });

  describe("Coinbase Wallet (com.coinbase.wallet)", () => {
    // Verified May 2026. Rejects EIP-2255 with a wrapped error:
    // outer code -32603 ("internal error") containing originalError
    // with code -32604 ("method not supported").
    const info = baseInfo("com.coinbase.wallet", "Coinbase Wallet");

    it("rejection (-32603 wrapping -32604) falls back to eth_requestAccounts", async () => {
      const provider = createMockProvider({
        eth_requestAccounts: () => ["0x53d120cf09b21c2fcc67814cdf10c8ca9bcc7670"],
        wallet_requestPermissions: () =>
          Promise.reject({
            code: -32603,
            data: { originalError: { code: -32604, message: "not supported" } },
            message: "this request method is not supported",
          }),
      });
      const adapter = buildEvmAdapter(info, provider);
      await adapter.requestAccounts?.();
      expect(provider.requests.map((r) => r.method)).toEqual([
        "wallet_requestPermissions",
        "eth_requestAccounts",
      ]);
    });

    it("capabilities.requestAccounts is false (no fresh picker possible)", () => {
      const adapter = buildEvmAdapter(info, createMockProvider({}));
      expect(adapter.capabilities.requestAccounts).toBe(false);
    });
  });

  describe("Phantom EVM (app.phantom)", () => {
    // Verified May 2026. Rejects EIP-2255 with code -32601
    // (JSON-RPC "method not found") or 4200 (EIP-1474 "method not
    // supported") depending on the Phantom version.
    const info = baseInfo("app.phantom", "Phantom");

    it("rejection (-32601) falls back to eth_requestAccounts", async () => {
      const provider = createMockProvider({
        eth_requestAccounts: () => ["0xabc"],
        wallet_requestPermissions: () =>
          Promise.reject({ code: -32601, message: "method not found" }),
      });
      const adapter = buildEvmAdapter(info, provider);
      await adapter.requestAccounts?.();
      expect(provider.requests.map((r) => r.method)).toEqual([
        "wallet_requestPermissions",
        "eth_requestAccounts",
      ]);
    });

    it("rejection (4200) also falls back", async () => {
      const provider = createMockProvider({
        eth_requestAccounts: () => ["0xabc"],
        wallet_requestPermissions: () =>
          Promise.reject({ code: 4200, message: "method not supported" }),
      });
      const adapter = buildEvmAdapter(info, provider);
      await adapter.requestAccounts?.();
      expect(provider.requests.map((r) => r.method)).toEqual([
        "wallet_requestPermissions",
        "eth_requestAccounts",
      ]);
    });

    it("capabilities.requestAccounts is false (fallback is a no-op for user)", () => {
      const adapter = buildEvmAdapter(info, createMockProvider({}));
      expect(adapter.capabilities.requestAccounts).toBe(false);
    });
  });

  describe("Rabby (io.rabby)", () => {
    // Verified May 2026. Rabby implements EIP-2255 but silently
    // returns the existing permission set without surfacing a picker
    // UI to the user. The call succeeds; no fallback fires; the
    // observable effect is nothing.
    const info = baseInfo("io.rabby", "Rabby");

    it("wallet_requestPermissions resolves but no picker UI surfaces (simulated)", async () => {
      const provider = createMockProvider({
        wallet_requestPermissions: () => [{ parentCapability: "eth_accounts" }],
      });
      const adapter = buildEvmAdapter(info, provider);
      await adapter.requestAccounts?.();
      expect(provider.requests.map((r) => r.method)).toEqual(["wallet_requestPermissions"]);
    });

    it("capabilities.requestAccounts is false (silent return wouldn't surface a picker)", () => {
      const adapter = buildEvmAdapter(info, createMockProvider({}));
      expect(adapter.capabilities.requestAccounts).toBe(false);
    });
  });

  describe("Defence-in-depth: unknown wallets", () => {
    it("falls back to eth_requestAccounts when an unknown wallet rejects with -32601", async () => {
      const provider = createMockProvider({
        eth_requestAccounts: () => ["0xabc"],
        wallet_requestPermissions: () => Promise.reject({ code: -32601 }),
      });
      const adapter = buildEvmAdapter(baseInfo("xyz.unknown", "Unknown"), provider);
      await adapter.requestAccounts?.();
      expect(provider.requests.map((r) => r.method)).toEqual([
        "wallet_requestPermissions",
        "eth_requestAccounts",
      ]);
    });

    it("re-throws on user rejection (code 4001) without trying the fallback", async () => {
      const provider = createMockProvider({
        wallet_requestPermissions: () =>
          Promise.reject({ code: 4001, message: "User rejected the request" }),
      });
      // Use MetaMask info so the capability flag is true and the
      // requestAccounts path is exercised (it works the same for any
      // wallet — this is testing the rejection handling, not the
      // capability gating).
      const adapter = buildEvmAdapter(baseInfo("io.metamask", "MetaMask"), provider);
      await expect(adapter.requestAccounts?.()).rejects.toMatchObject({ code: 4001 });
      expect(provider.requests.map((r) => r.method)).toEqual(["wallet_requestPermissions"]);
    });

    it("re-throws unknown error shapes (no code) without trying the fallback", async () => {
      const provider = createMockProvider({
        wallet_requestPermissions: () => Promise.reject(new Error("generic failure")),
      });
      const adapter = buildEvmAdapter(baseInfo("io.metamask", "MetaMask"), provider);
      await expect(adapter.requestAccounts?.()).rejects.toThrow(/generic failure/);
      expect(provider.requests.map((r) => r.method)).toEqual(["wallet_requestPermissions"]);
    });
  });
});

describe("EVM capability allow-list (Strategy B)", () => {
  // Pin the contents of `RDNS_WITH_REQUEST_ACCOUNTS` as a test —
  // any addition or removal becomes a visible diff in this file
  // alongside the adapter change.
  it.each([
    ["io.metamask", "MetaMask", true],
    ["io.rabby", "Rabby", false],
    ["com.coinbase.wallet", "Coinbase Wallet", false],
    ["app.phantom", "Phantom", false],
    ["com.brave.wallet", "Brave Wallet", false],
    ["com.okex.wallet", "OKX Wallet", false],
    ["com.binance.wallet", "Binance Wallet", false],
    ["com.bitkeep.wallet", "Bitget Wallet", false],
    ["com.trustwallet.app", "Trust Wallet", false],
    ["com.backpack", "Backpack", false],
    ["sh.frame.wallet", "Frame", false],
    ["xyz.unknown.wallet", "Unknown Wallet", false],
  ])("rdns=%s → capabilities.requestAccounts=%s", (rdns, name, expected) => {
    const adapter = buildEvmAdapter(baseInfo(rdns, name), createMockProvider({}));
    expect(adapter.capabilities.requestAccounts).toBe(expected);
  });
});

describe("EVM universal capabilities (every wallet)", () => {
  // Properties that are constant across the entire EIP-6963 adapter
  // surface. If any of these flip per-wallet in the future, the
  // capability needs to graduate from "EVM constant" to "per-wallet"
  // and this test should split.
  it.each([
    "io.metamask",
    "io.rabby",
    "com.coinbase.wallet",
    "app.phantom",
    "com.binance.wallet",
    "com.okex.wallet",
  ])("rdns=%s has the expected universal EVM capabilities", (rdns) => {
    const adapter = buildEvmAdapter(baseInfo(rdns, "test"), createMockProvider({}));
    expect(adapter.capabilities).toMatchObject({
      getBalance: true,
      getTransactionReceipt: true,
      sendTransaction: true,
      signMessage: true,
      subscribe: true,
      switchAccount: false,
      switchChain: true,
    });
  });
});

describe("Unverified wallets (todo — promote to fixtures once verified)", () => {
  // These wallets are listed in the EVM coverage matrix but haven't
  // been driven against a real install. Promote each to a real
  // describe block once verified. Until then, the allow-list test
  // above pins their capabilities at `false` (the safe default).
  it.todo("Brave Wallet: verify wallet_requestPermissions actually opens a picker");
  it.todo("Bitget Wallet: verify EIP-6963 announcement format");
  it.todo("Trust Wallet (extension): verify connect/sign/disconnect flow");
  it.todo("Frame: verify hardware-wallet pass-through");
});
