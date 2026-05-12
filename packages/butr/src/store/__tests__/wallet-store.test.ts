import { describe, expect, it, vi } from "vitest";
import { createWalletStore } from "../wallet-store";
import { WalletStorage } from "../../storage/wallet-storage";
import {
  createMockAccount,
  createMockChain,
  createMockConfig,
  createMockConnector,
  createMockStorageDriver,
} from "../../__tests__/helpers";
import type { WalletManagerConfig } from "../../types";

const createTestStore = (overrides?: Partial<WalletManagerConfig>) => {
  const persistent = createMockStorageDriver();
  const session = createMockStorageDriver();
  const storage = new WalletStorage({
    keyPrefix: "test",
    persistent,
    session,
  });
  const config = createMockConfig({ storage, ...overrides });
  const store = createWalletStore(config);
  return { config, persistent, session, storage, store };
};

const hydrateStore = async (store: ReturnType<typeof createWalletStore>) => {
  await store.getState()._hydrateWallets();
};

describe("createWalletStore", () => {
  describe("initial state", () => {
    it("starts empty", () => {
      const { store } = createTestStore();
      const state = store.getState();
      expect(state.pool.size).toBe(0);
      expect(state.selection.size).toBe(0);
      expect(state.activeConnectorId).toBeNull();
      expect(state.connectingConnectorId).toBeNull();
      expect(state.isHydrated).toBe(false);
      expect(state.isUserDisconnected).toBe(false);
    });

    it("starts with idle connection status", () => {
      const { store } = createTestStore();
      const state = store.getState();
      expect(state.connectionStatus).toBe("idle");
      expect(state.connectionError).toBeNull();
    });
  });

  describe("connectWallet", () => {
    it("populates pool, selection, and active on success", async () => {
      const account = createMockAccount();
      const connector = createMockConnector({
        chainPlatform: "evm",
        getAccount: vi.fn().mockResolvedValue(account),
        id: "metamask",
      });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("metamask");

      const state = store.getState();
      expect(state.pool.size).toBe(1);
      expect(state.pool.get("metamask")?.connector.id).toBe("metamask");
      expect(state.pool.get("metamask")?.account).toEqual(account);
      expect(state.pool.get("metamask")?.accounts).toEqual([account]);
      expect(state.selection.get("evm")).toBe("metamask");
      expect(state.activeConnectorId).toBe("metamask");
      expect(state.connectionStatus).toBe("success");
    });

    it("populates accounts list via connector.getAccounts when present", async () => {
      const a = createMockAccount({ id: "a", walletAddress: "0xA" });
      const b = createMockAccount({ id: "b", walletAddress: "0xB" });
      const connector = createMockConnector({
        getAccount: vi.fn().mockResolvedValue(a),
        getAccounts: vi.fn().mockResolvedValue([a, b]),
        id: "metamask",
      });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("metamask");
      expect(store.getState().pool.get("metamask")?.accounts).toEqual([a, b]);
    });

    it("falls back to [account] when getAccounts throws", async () => {
      const account = createMockAccount();
      const connector = createMockConnector({
        getAccount: vi.fn().mockResolvedValue(account),
        getAccounts: vi.fn().mockRejectedValue(new Error("not supported")),
      });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("test");
      expect(store.getState().pool.get("test")?.accounts).toEqual([account]);
    });

    it("connects two wallets on different platforms simultaneously", async () => {
      const evmConnector = createMockConnector({ chainPlatform: "evm", id: "metamask" });
      const svmConnector = createMockConnector({ chainPlatform: "svm", id: "phantom" });
      const { store } = createTestStore({
        createConnector: vi.fn((id) => (id === "metamask" ? evmConnector : svmConnector)),
      });

      await store.getState().connectWallet("metamask");
      await store.getState().connectWallet("phantom");

      const state = store.getState();
      expect(state.pool.size).toBe(2);
      expect(state.selection.get("evm")).toBe("metamask");
      expect(state.selection.get("svm")).toBe("phantom");
      expect(state.activeConnectorId).toBe("phantom");
    });

    it("clears the disconnect-intent flag when connecting", async () => {
      const { storage, store } = createTestStore();
      await storage.markUserDisconnected(true);
      await hydrateStore(store);
      expect(store.getState().isUserDisconnected).toBe(true);

      await store.getState().connectWallet("test");
      expect(store.getState().isUserDisconnected).toBe(false);
      expect(await storage.isUserDisconnected()).toBe(false);
    });

    it("skips pool churn when connecting same address on same connector", async () => {
      const account = createMockAccount({ walletAddress: "0xSAME" });
      const connector = createMockConnector({
        getAccount: vi.fn().mockResolvedValue(account),
      });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("test");
      const poolAfterFirst = store.getState().pool;

      await store.getState().connectWallet("test");
      const poolAfterSecond = store.getState().pool;

      expect(poolAfterFirst).toBe(poolAfterSecond);
    });

    it("calls onConnect and onSuccess", async () => {
      const onConnect = vi.fn();
      const onSuccess = vi.fn();
      const { store } = createTestStore({ onConnect });
      await store.getState().connectWallet("test", onSuccess);
      expect(onConnect).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it("sets error and calls onError on failure", async () => {
      const connector = createMockConnector({
        connect: vi.fn().mockRejectedValue(new Error("User rejected")),
      });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });
      const onError = vi.fn();

      await expect(store.getState().connectWallet("test", undefined, onError)).rejects.toThrow(
        "User rejected",
      );

      expect(store.getState().connectionStatus).toBe("error");
      expect(store.getState().connectionError?.kind).toBe("UserRejected");
      expect(store.getState().connectionError?.message).toBe("User rejected");
      expect(store.getState().connectingConnectorId).toBeNull();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(connector.disconnect).toHaveBeenCalled();
    });

    it("maps EIP-1193 code 4001 to UserRejected", async () => {
      const evmError = Object.assign(new Error("user denied transaction"), { code: 4001 });
      const connector = createMockConnector({
        connect: vi.fn().mockRejectedValue(evmError),
      });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });
      await expect(store.getState().connectWallet("test")).rejects.toThrow();
      expect(store.getState().connectionError?.kind).toBe("UserRejected");
    });

    it("maps EIP-1193 code -32002 to RequestPending", async () => {
      const evmError = Object.assign(new Error("request already pending"), { code: -32_002 });
      const connector = createMockConnector({
        connect: vi.fn().mockRejectedValue(evmError),
      });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });
      await expect(store.getState().connectWallet("test")).rejects.toThrow();
      expect(store.getState().connectionError?.kind).toBe("RequestPending");
    });

    it("maps timeout to Timeout", async () => {
      vi.useFakeTimers();
      const connector = createMockConnector({
        connect: vi.fn().mockReturnValue(new Promise(() => {})),
      });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });
      const promise = store.getState().connectWallet("slow");
      vi.advanceTimersByTime(90_001);
      await expect(promise).rejects.toThrow();
      vi.useRealTimers();
      expect(store.getState().connectionError?.kind).toBe("Timeout");
    });

    it("throws when connector cannot be created", async () => {
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(null),
      });
      await expect(store.getState().connectWallet("bad")).rejects.toThrow(
        "Failed to create connector",
      );
    });

    it("rejects on connection timeout", async () => {
      vi.useFakeTimers();
      const connector = createMockConnector({
        connect: vi.fn().mockReturnValue(new Promise(() => {})),
      });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      const promise = store.getState().connectWallet("slow");
      vi.advanceTimersByTime(90_001);

      await expect(promise).rejects.toThrow("Connection timeout");
      vi.useRealTimers();
    });

    it("transitions connectingConnectorId during the in-flight connect", async () => {
      let resolveConnect: () => void;
      const connector = createMockConnector({
        connect: vi.fn().mockReturnValue(
          new Promise<void>((resolve) => {
            resolveConnect = resolve;
          }),
        ),
      });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      const connectPromise = store.getState().connectWallet("test");
      await Promise.resolve();
      expect(store.getState().connectionStatus).toBe("connecting");
      expect(store.getState().connectingConnectorId).toBe("test");

      resolveConnect!();
      await connectPromise;
      expect(store.getState().connectionStatus).toBe("success");
      expect(store.getState().connectingConnectorId).toBeNull();
      expect(store.getState().activeConnectorId).toBe("test");
    });
  });

  describe("disconnectWallet", () => {
    it("removes a wallet by connectorId", async () => {
      const connector = createMockConnector({ id: "metamask" });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("metamask");
      await hydrateStore(store);

      store.getState().disconnectWallet("metamask");

      expect(store.getState().pool.size).toBe(0);
      expect(store.getState().selection.has("evm")).toBe(false);
      expect(store.getState().activeConnectorId).toBeNull();
      expect(connector.disconnect).toHaveBeenCalled();
    });

    it("falls selection to another wallet on same platform when one is dropped", async () => {
      const meta = createMockConnector({ chainPlatform: "evm", id: "metamask" });
      const rabby = createMockConnector({ chainPlatform: "evm", id: "rabby" });
      const { store } = createTestStore({
        createConnector: vi.fn((id) => (id === "metamask" ? meta : rabby)),
      });

      await store.getState().connectWallet("metamask");
      await store.getState().connectWallet("rabby");
      await hydrateStore(store);
      // After connecting rabby second, selection.evm = rabby (overwrites)
      expect(store.getState().selection.get("evm")).toBe("rabby");

      store.getState().disconnectWallet("rabby");
      // Selection falls back to metamask (the remaining EVM wallet)
      expect(store.getState().selection.get("evm")).toBe("metamask");
    });

    it("sets disconnect-intent flag", async () => {
      const connector = createMockConnector({ id: "metamask" });
      const { storage, store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("metamask");
      await hydrateStore(store);
      store.getState().disconnectWallet("metamask");

      expect(store.getState().isUserDisconnected).toBe(true);
      expect(await storage.isUserDisconnected()).toBe(true);
    });

    it("is a no-op for unknown connectorId", async () => {
      const connector = createMockConnector({ id: "metamask" });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("metamask");
      await hydrateStore(store);

      store.getState().disconnectWallet("nonexistent");
      expect(store.getState().pool.size).toBe(1);
    });

    it("is a no-op before hydration", async () => {
      const connector = createMockConnector();
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("test");
      // intentionally NOT hydrating
      store.getState().disconnectWallet("test");
      expect(store.getState().pool.size).toBe(1);
    });

    it("calls onDisconnect with the chainPlatform of the removed wallet", async () => {
      const onDisconnect = vi.fn();
      const connector = createMockConnector({ chainPlatform: "evm", id: "metamask" });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
        onDisconnect,
      });

      await store.getState().connectWallet("metamask");
      await hydrateStore(store);
      store.getState().disconnectWallet("metamask");

      expect(onDisconnect).toHaveBeenCalledWith("evm");
    });

    it("clears storage when last wallet is disconnected", async () => {
      const connector = createMockConnector();
      const { storage, store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });
      const clearAllSpy = vi.spyOn(storage, "clearAll");

      await store.getState().connectWallet("test");
      await hydrateStore(store);
      store.getState().disconnectWallet("test");

      expect(clearAllSpy).toHaveBeenCalled();
    });
  });

  describe("setActiveConnector", () => {
    it("changes the active connector without touching selection or pool", async () => {
      const meta = createMockConnector({ chainPlatform: "evm", id: "metamask" });
      const phantom = createMockConnector({ chainPlatform: "svm", id: "phantom" });
      const { store } = createTestStore({
        createConnector: vi.fn((id) => (id === "metamask" ? meta : phantom)),
      });

      await store.getState().connectWallet("metamask");
      await store.getState().connectWallet("phantom");

      const selectionBefore = store.getState().selection;
      const poolBefore = store.getState().pool;

      store.getState().setActiveConnector("metamask");

      expect(store.getState().activeConnectorId).toBe("metamask");
      expect(store.getState().selection).toBe(selectionBefore);
      expect(store.getState().pool).toBe(poolBefore);
    });
  });

  describe("setSelection", () => {
    it("updates the selection for a platform", async () => {
      const meta = createMockConnector({ chainPlatform: "evm", id: "metamask" });
      const rabby = createMockConnector({ chainPlatform: "evm", id: "rabby" });
      const { store } = createTestStore({
        createConnector: vi.fn((id) => (id === "metamask" ? meta : rabby)),
      });

      await store.getState().connectWallet("metamask");
      await store.getState().connectWallet("rabby");
      // Default: most-recently-connected wins
      expect(store.getState().selection.get("evm")).toBe("rabby");

      store.getState().setSelection("evm", "metamask");
      expect(store.getState().selection.get("evm")).toBe("metamask");
    });

    it("clears selection when given null", async () => {
      const connector = createMockConnector();
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });
      await store.getState().connectWallet("test");
      expect(store.getState().selection.has("evm")).toBe(true);

      store.getState().setSelection("evm", null);
      expect(store.getState().selection.has("evm")).toBe(false);
    });
  });

  describe("connector subscription bridge", () => {
    it("mirrors the wallet's exposed accounts on accountChanged", async () => {
      const original = createMockAccount({ walletAddress: "0xORIG" });
      type AccountChangedEvent = {
        account: typeof original;
        accounts: Array<typeof original>;
        type: "accountChanged";
      };
      let listener: ((event: AccountChangedEvent) => void) | null = null;
      const subscribe = vi.fn((l: (e: AccountChangedEvent) => void) => {
        listener = l;
        return () => {
          listener = null;
        };
      });
      const connector = createMockConnector({
        getAccount: vi.fn().mockResolvedValue(original),
        id: "metamask",
        subscribe: subscribe as unknown as never,
      });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("metamask");
      expect(subscribe).toHaveBeenCalledTimes(1);

      // Single-account-exposure wallet (Phantom EVM, MetaMask Snap):
      // accountsChanged carries just the new active. Pool entry's
      // `accounts` array drops the previous address.
      const next = createMockAccount({ walletAddress: "0xNEXT" });
      listener!({ account: next, accounts: [next], type: "accountChanged" });

      let wallet = store.getState().pool.get("metamask");
      expect(wallet?.account.walletAddress).toBe("0xNEXT");
      expect(wallet?.accounts.map((a) => a.walletAddress)).toEqual(["0xNEXT"]);

      // Multi-account-exposure wallet (MetaMask EVM): accountsChanged
      // carries the full authorized set. Pool entry mirrors it verbatim.
      const alt = createMockAccount({ walletAddress: "0xALT" });
      listener!({ account: next, accounts: [next, alt], type: "accountChanged" });
      wallet = store.getState().pool.get("metamask");
      expect(wallet?.account.walletAddress).toBe("0xNEXT");
      expect(wallet?.accounts.map((a) => a.walletAddress)).toEqual(["0xNEXT", "0xALT"]);
    });

    it("dispatches disconnected events into DISCONNECTED", async () => {
      let listener: ((event: { type: "disconnected" }) => void) | null = null;
      const unsub = vi.fn();
      const subscribe = vi.fn((l: (e: { type: "disconnected" }) => void) => {
        listener = l;
        return unsub;
      });
      const connector = createMockConnector({
        id: "metamask",
        subscribe: subscribe as unknown as never,
      });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("metamask");
      await hydrateStore(store);

      listener!({ type: "disconnected" });

      expect(store.getState().pool.size).toBe(0);
      expect(unsub).toHaveBeenCalled();
    });

    it("unsubscribes on explicit disconnect", async () => {
      const unsub = vi.fn();
      const connector = createMockConnector({
        id: "metamask",
        subscribe: vi.fn(() => unsub) as unknown as never,
      });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("metamask");
      await hydrateStore(store);
      store.getState().disconnectWallet("metamask");

      expect(unsub).toHaveBeenCalled();
    });

    it("unsubscribes all connectors on reset", async () => {
      const unsubA = vi.fn();
      const unsubB = vi.fn();
      const a = createMockConnector({
        chainPlatform: "evm",
        id: "metamask",
        subscribe: vi.fn(() => unsubA) as unknown as never,
      });
      const b = createMockConnector({
        chainPlatform: "svm",
        id: "phantom",
        subscribe: vi.fn(() => unsubB) as unknown as never,
      });
      const { store } = createTestStore({
        createConnector: vi.fn((id) => (id === "metamask" ? a : b)),
      });

      await store.getState().connectWallet("metamask");
      await store.getState().connectWallet("phantom");
      await hydrateStore(store);
      store.getState().reset();

      expect(unsubA).toHaveBeenCalled();
      expect(unsubB).toHaveBeenCalled();
    });
  });

  describe("updateWalletAccount", () => {
    it("updates the account for a connector in the pool", async () => {
      const connector = createMockConnector({ id: "metamask" });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("metamask");

      const newAccount = createMockAccount({
        chain: createMockChain({ id: "eip155:42161" }),
        walletAddress: "0xNEW",
      });
      store.getState().updateWalletAccount("metamask", newAccount);

      expect(store.getState().pool.get("metamask")?.account.walletAddress).toBe("0xNEW");
    });

    it("skips update when address and chain unchanged", async () => {
      const account = createMockAccount();
      const connector = createMockConnector({
        getAccount: vi.fn().mockResolvedValue(account),
      });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("test");
      const poolBefore = store.getState().pool;

      store.getState().updateWalletAccount("test", { ...account });
      expect(store.getState().pool).toBe(poolBefore);
    });

    it("is a no-op for unknown connectorId", () => {
      const { store } = createTestStore();
      store.getState().updateWalletAccount("nope", createMockAccount());
      expect(store.getState().pool.size).toBe(0);
    });
  });

  describe("refreshWallet", () => {
    it("creates a new wallet object reference", async () => {
      const connector = createMockConnector();
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("test");
      const before = store.getState().pool.get("test");

      store.getState().refreshWallet("test");
      const after = store.getState().pool.get("test");

      expect(before).not.toBe(after);
      expect(before?.account).toEqual(after?.account);
    });

    it("is a no-op for unknown connectorId", () => {
      const { store } = createTestStore();
      const poolBefore = store.getState().pool;
      store.getState().refreshWallet("nope");
      expect(store.getState().pool).toBe(poolBefore);
    });
  });

  describe("reset", () => {
    it("clears pool, selection, active, and storage", async () => {
      const connector = createMockConnector();
      const { storage, store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });
      const clearAllSpy = vi.spyOn(storage, "clearAll");

      await store.getState().connectWallet("test");
      await hydrateStore(store);
      store.getState().reset();

      const state = store.getState();
      expect(state.pool.size).toBe(0);
      expect(state.selection.size).toBe(0);
      expect(state.activeConnectorId).toBeNull();
      expect(state.connectionStatus).toBe("idle");
      expect(clearAllSpy).toHaveBeenCalled();
      expect(connector.disconnect).toHaveBeenCalled();
    });

    it("calls onReset", async () => {
      const onReset = vi.fn();
      const connector = createMockConnector();
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
        onReset,
      });
      await store.getState().connectWallet("test");
      await hydrateStore(store);
      store.getState().reset();
      expect(onReset).toHaveBeenCalledTimes(1);
    });

    it("sets disconnect-intent flag", async () => {
      const connector = createMockConnector();
      const { storage, store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });
      await store.getState().connectWallet("test");
      await hydrateStore(store);
      store.getState().reset();

      expect(store.getState().isUserDisconnected).toBe(true);
      expect(await storage.isUserDisconnected()).toBe(true);
    });

    it("is a no-op before hydration", async () => {
      const connector = createMockConnector();
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });
      await store.getState().connectWallet("test");
      store.getState().reset();
      expect(store.getState().pool.size).toBe(1);
    });
  });

  describe("_hydrateWallets", () => {
    it("restores pool, selection, and active from storage", async () => {
      const account = createMockAccount();
      const connector = createMockConnector({
        getAccount: vi.fn().mockResolvedValue(account),
        id: "metamask",
      });
      const { storage, store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      const wallets = new Map([["metamask", { account, connector }]]);
      await storage.setPool(wallets);
      await storage.setSelection(new Map([["evm", "metamask"]]));
      await storage.setActiveConnectorId("metamask");

      await hydrateStore(store);

      const state = store.getState();
      expect(state.isHydrated).toBe(true);
      expect(state.pool.size).toBe(1);
      expect(state.pool.get("metamask")?.connector.id).toBe("metamask");
      expect(state.selection.get("evm")).toBe("metamask");
      expect(state.activeConnectorId).toBe("metamask");
    });

    it("syncs isUserDisconnected from storage", async () => {
      const { storage, store } = createTestStore();
      await storage.markUserDisconnected(true);
      await hydrateStore(store);
      expect(store.getState().isUserDisconnected).toBe(true);
    });

    it("drops connectors that fail to connect during hydration", async () => {
      const connector = createMockConnector({
        connect: vi.fn().mockRejectedValue(new Error("connection failed")),
        id: "broken",
      });
      const { storage, store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });
      await storage.setPool(new Map([["broken", { account: createMockAccount(), connector }]]));
      const removeSpy = vi.spyOn(storage, "removePoolEntry");

      await hydrateStore(store);

      expect(store.getState().pool.size).toBe(0);
      expect(store.getState().isHydrated).toBe(true);
      expect(removeSpy).toHaveBeenCalledWith("broken");
    });

    it("drops stale selection entries pointing at missing connectors", async () => {
      const connector = createMockConnector({ id: "metamask" });
      const { storage, store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });
      // Store has a selection pointing at an id that's not in the pool.
      await storage.setSelection(new Map([["evm", "deleted-connector"]]));

      await hydrateStore(store);

      expect(store.getState().selection.has("evm")).toBe(false);
    });

    it("falls back to first wallet for active when stored active is missing", async () => {
      const connector = createMockConnector({ id: "metamask" });
      const { storage, store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });
      await storage.setPool(new Map([["metamask", { account: createMockAccount(), connector }]]));
      await storage.setActiveConnectorId("ghost");

      await hydrateStore(store);

      expect(store.getState().activeConnectorId).toBe("metamask");
    });

    it("uses stored account as fallback when getAccount returns null", async () => {
      const storedAccount = createMockAccount({ walletAddress: "0xSTORED" });
      const connector = createMockConnector({
        getAccount: vi.fn().mockResolvedValue(null),
        id: "metamask",
      });
      const { storage, store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });
      await storage.setPool(new Map([["metamask", { account: storedAccount, connector }]]));

      await hydrateStore(store);
      expect(store.getState().pool.get("metamask")?.account.walletAddress).toBe("0xSTORED");
    });
  });

  describe("connection status", () => {
    it("setConnectionError sets error status", () => {
      const { store } = createTestStore();
      store.getState().setConnectionError({ kind: "Unknown", message: "something broke" });
      expect(store.getState().connectionStatus).toBe("error");
      expect(store.getState().connectionError?.kind).toBe("Unknown");
      expect(store.getState().connectionError?.message).toBe("something broke");
    });

    it("setConnectionError with null returns to idle", () => {
      const { store } = createTestStore();
      store.getState().setConnectionError({ kind: "Unknown", message: "error" });
      store.getState().setConnectionError(null);
      expect(store.getState().connectionStatus).toBe("idle");
      expect(store.getState().connectionError).toBeNull();
    });

    it("resetConnectionStatus clears connecting + error", () => {
      const { store } = createTestStore();
      // Drive the store into an "error" state via the public API, then
      // verify reset clears it back to idle.
      store.getState().setConnectionError({ kind: "UserRejected", message: "user rejected" });
      expect(store.getState().connectionStatus).toBe("error");
      store.getState().resetConnectionStatus();
      expect(store.getState().connectionStatus).toBe("idle");
      expect(store.getState().connectingConnectorId).toBeNull();
      expect(store.getState().connectionError).toBeNull();
    });
  });
});
