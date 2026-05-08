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
import type { ChainPlatform, WalletManagerConfig } from "../../types";

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
    it("starts with no connected wallets", () => {
      const { store } = createTestStore();
      const state = store.getState();

      expect(state.connectedWallets.size).toBe(0);
      expect(state.wallets).toEqual([]);
      expect(state.hasAnyWallet).toBe(false);
      expect(state.connected).toBe(false);
      expect(state.connecting).toBe(false);
      expect(state.walletMode).toBe("none");
      expect(state.isHydrated).toBe(false);
      expect(state.isUserDisconnected).toBe(false);
    });

    it("starts with idle connection status", () => {
      const { store } = createTestStore();
      const state = store.getState();

      expect(state.connectionStatus).toBe("idle");
      expect(state.connectionError).toBeNull();
      expect(state.activeConnectorId).toBeNull();
    });
  });

  describe("connectWallet", () => {
    it("connects a wallet and updates state", async () => {
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
      expect(state.connectedWallets.size).toBe(1);
      expect(state.connectedWallets.get("evm")?.connector.id).toBe("metamask");
      expect(state.connectedWallets.get("evm")?.account).toEqual(account);
      expect(state.connected).toBe(true);
      expect(state.hasAnyWallet).toBe(true);
      expect(state.connectionStatus).toBe("success");
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

    it("sets walletMode to external-wallet for non-smart wallets", async () => {
      const connector = createMockConnector({ isSmartWallet: false });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("test");
      expect(store.getState().walletMode).toBe("external-wallet");
    });

    it("sets walletMode to smart-wallet for smart wallets", async () => {
      const connector = createMockConnector({
        chainPlatform: "unified",
        isSmartWallet: true,
      });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("smart");
      expect(store.getState().walletMode).toBe("smart-wallet");
    });

    it("skips Map update when connecting same address on same platform", async () => {
      const account = createMockAccount({ walletAddress: "0xSAME" });
      const connector = createMockConnector({
        getAccount: vi.fn().mockResolvedValue(account),
      });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("test");
      const walletsAfterFirst = store.getState().connectedWallets;

      await store.getState().connectWallet("test");
      const walletsAfterSecond = store.getState().connectedWallets;

      expect(walletsAfterFirst).toBe(walletsAfterSecond);
    });

    it("auto-disconnects external wallets when connecting smart wallet", async () => {
      const externalConnector = createMockConnector({
        id: "metamask",
        isSmartWallet: false,
      });
      const smartConnector = createMockConnector({
        chainPlatform: "unified",
        id: "privy",
        isSmartWallet: true,
      });
      const { store } = createTestStore({
        createConnector: vi
          .fn()
          .mockReturnValueOnce(externalConnector)
          .mockReturnValueOnce(externalConnector)
          .mockReturnValue(smartConnector),
      });

      await store.getState().connectWallet("metamask");
      // need to hydrate so disconnectWallet works
      await hydrateStore(store);
      expect(store.getState().walletMode).toBe("external-wallet");

      await store.getState().connectWallet("privy");
      expect(store.getState().walletMode).toBe("smart-wallet");
      expect(externalConnector.disconnect).toHaveBeenCalled();
    });

    it("auto-disconnects smart wallets when connecting external wallet", async () => {
      const smartConnector = createMockConnector({
        chainPlatform: "unified",
        id: "privy",
        isSmartWallet: true,
      });
      const externalConnector = createMockConnector({
        id: "metamask",
        isSmartWallet: false,
      });
      const { store } = createTestStore({
        createConnector: vi
          .fn()
          .mockReturnValueOnce(smartConnector)
          .mockReturnValueOnce(smartConnector)
          .mockReturnValue(externalConnector),
      });

      await store.getState().connectWallet("privy");
      await hydrateStore(store);
      expect(store.getState().walletMode).toBe("smart-wallet");

      await store.getState().connectWallet("metamask");
      expect(store.getState().walletMode).toBe("external-wallet");
    });

    it("calls onConnect callback", async () => {
      const onConnect = vi.fn();
      const { store } = createTestStore({ onConnect });

      await store.getState().connectWallet("test");
      expect(onConnect).toHaveBeenCalledTimes(1);
      expect(onConnect).toHaveBeenCalledWith(
        expect.objectContaining({
          account: expect.any(Object),
          connector: expect.any(Object),
        }),
      );
    });

    it("calls onSuccess callback", async () => {
      const { store } = createTestStore();
      const onSuccess = vi.fn();

      await store.getState().connectWallet("test", onSuccess);
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it("sets error status and calls onError on failure", async () => {
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
      expect(store.getState().connectionError).toBe("User rejected");
      expect(onError).toHaveBeenCalledTimes(1);
      expect(connector.disconnect).toHaveBeenCalled();
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
  });

  describe("disconnectWallet", () => {
    it("removes wallet by exact platform key", async () => {
      const connector = createMockConnector({ id: "metamask" });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("metamask");
      await hydrateStore(store);

      store.getState().disconnectWallet("evm");

      expect(store.getState().connectedWallets.size).toBe(0);
      expect(store.getState().connected).toBe(false);
      expect(connector.disconnect).toHaveBeenCalled();
    });

    it("sets the disconnect-intent flag", async () => {
      const connector = createMockConnector({ id: "metamask" });
      const { storage, store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("metamask");
      await hydrateStore(store);

      store.getState().disconnectWallet("evm");

      expect(store.getState().isUserDisconnected).toBe(true);
      expect(await storage.isUserDisconnected()).toBe(true);
    });

    it("falls back to unified when requesting evm", async () => {
      const connector = createMockConnector({
        chainPlatform: "unified",
        id: "privy",
      });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("privy");
      await hydrateStore(store);

      store.getState().disconnectWallet("evm");
      expect(store.getState().connectedWallets.size).toBe(0);
    });

    it("is a no-op before hydration", async () => {
      const connector = createMockConnector();
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("test");
      // intentionally NOT hydrating
      store.getState().disconnectWallet("evm");

      expect(store.getState().connectedWallets.size).toBe(1);
    });

    it("calls onDisconnect callback", async () => {
      const onDisconnect = vi.fn();
      const connector = createMockConnector();
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
        onDisconnect,
      });

      await store.getState().connectWallet("test");
      await hydrateStore(store);
      store.getState().disconnectWallet("evm");

      expect(onDisconnect).toHaveBeenCalledWith("evm");
    });

    it("clears storage when last wallet disconnected", async () => {
      const connector = createMockConnector();
      const { storage, store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });
      const clearAllSpy = vi.spyOn(storage, "clearAll");

      await store.getState().connectWallet("test");
      await hydrateStore(store);
      store.getState().disconnectWallet("evm");

      expect(clearAllSpy).toHaveBeenCalled();
      expect(store.getState().walletMode).toBe("none");
    });

    it("completes disconnect even when storage.clearAll throws", async () => {
      const onDisconnect = vi.fn();
      const connector = createMockConnector();
      const { storage, store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
        onDisconnect,
      });
      vi.spyOn(storage, "clearAll").mockImplementation(() =>
        Promise.reject(new Error("storage exploded")),
      );

      await store.getState().connectWallet("test");
      await hydrateStore(store);

      store.getState().disconnectWallet("evm");

      expect(store.getState().connectedWallets.size).toBe(0);
      expect(store.getState().connected).toBe(false);
      expect(store.getState().walletMode).toBe("none");
      expect(onDisconnect).toHaveBeenCalledWith("evm");
    });
  });

  describe("getWalletByPlatform", () => {
    it("returns wallet for exact platform key", async () => {
      const connector = createMockConnector({
        chainPlatform: "evm",
        id: "metamask",
      });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("metamask");

      const wallet = store.getState().getWalletByPlatform("evm");
      expect(wallet?.connector.id).toBe("metamask");
    });

    it("returns undefined for missing platform", () => {
      const { store } = createTestStore();
      expect(store.getState().getWalletByPlatform("svm")).toBeUndefined();
    });

    it("falls back to unified for evm platform", async () => {
      const evmAccount = createMockAccount({
        chain: createMockChain({ id: "eip155:1" }),
        walletAddress: "0xEVM",
      });
      const unifiedAccount = createMockAccount({
        chain: createMockChain({ id: "unified:1" }),
        walletAddress: "0xUNIFIED",
      });
      const connector = createMockConnector({
        chainPlatform: "unified",
        getAccount: vi.fn().mockResolvedValue(unifiedAccount),
        getAccountForPlatform: vi.fn().mockReturnValue(evmAccount),
        id: "privy",
      });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("privy");

      const wallet = store.getState().getWalletByPlatform("evm");
      expect(wallet?.account.walletAddress).toBe("0xEVM");
    });

    it("falls back to unified for svm platform", async () => {
      const svmAccount = createMockAccount({
        chain: createMockChain({ id: "solana:mainnet", namespace: "solana" }),
        walletAddress: "SoLaNa123",
      });
      const unifiedAccount = createMockAccount({
        walletAddress: "0xUNIFIED",
      });
      const connector = createMockConnector({
        chainPlatform: "unified",
        getAccount: vi.fn().mockResolvedValue(unifiedAccount),
        getAccountForPlatform: vi.fn().mockReturnValue(svmAccount),
        id: "privy",
      });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("privy");

      const wallet = store.getState().getWalletByPlatform("svm");
      expect(wallet?.account.walletAddress).toBe("SoLaNa123");
    });

    it("does not fall back to unified for move platform", async () => {
      const connector = createMockConnector({
        chainPlatform: "unified",
      });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("test");

      expect(store.getState().getWalletByPlatform("move")).toBeUndefined();
    });
  });

  describe("getWalletForOperation", () => {
    it("calls setActiveChainPlatform on the connector", async () => {
      const setActiveChainPlatform = vi.fn();
      const connector = createMockConnector({
        id: "metamask",
        setActiveChainPlatform,
      });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("metamask");
      store.getState().getWalletForOperation("evm");

      expect(setActiveChainPlatform).toHaveBeenCalledWith("evm");
    });

    it("returns wallet with resolved account when addresses differ", async () => {
      const resolvedAccount = createMockAccount({
        walletAddress: "0xRESOLVED",
      });
      const connector = createMockConnector({
        chainPlatform: "evm",
        getAccountForPlatform: vi.fn().mockReturnValue(resolvedAccount),
        id: "privy",
      });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("privy");
      const wallet = store.getState().getWalletForOperation("evm");

      expect(wallet?.account.walletAddress).toBe("0xRESOLVED");
    });

    it("returns undefined for missing platform", () => {
      const { store } = createTestStore();
      expect(store.getState().getWalletForOperation("svm")).toBeUndefined();
    });
  });

  describe("updateWalletAccount", () => {
    it("updates the account for a connected wallet", async () => {
      const connector = createMockConnector();
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("test");

      const newAccount = createMockAccount({
        chain: createMockChain({ id: "eip155:42161" }),
        walletAddress: "0xNEW",
      });
      store.getState().updateWalletAccount("evm", newAccount);

      expect(store.getState().connectedWallets.get("evm")?.account.walletAddress).toBe("0xNEW");
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
      const walletsBefore = store.getState().connectedWallets;

      store.getState().updateWalletAccount("evm", { ...account });
      const walletsAfter = store.getState().connectedWallets;

      expect(walletsBefore).toBe(walletsAfter);
    });

    it("falls back to unified for evm platform", async () => {
      const connector = createMockConnector({ chainPlatform: "unified" });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("test");

      const newAccount = createMockAccount({ walletAddress: "0xUPDATED" });
      store.getState().updateWalletAccount("evm", newAccount);

      expect(store.getState().connectedWallets.get("unified")?.account.walletAddress).toBe(
        "0xUPDATED",
      );
    });

    it("is a no-op for missing platform", () => {
      const { store } = createTestStore();
      const newAccount = createMockAccount();

      store.getState().updateWalletAccount("move", newAccount);
      expect(store.getState().connectedWallets.size).toBe(0);
    });
  });

  describe("refreshWallet", () => {
    it("creates a new object reference for the wallet", async () => {
      const connector = createMockConnector();
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("test");
      const walletBefore = store.getState().connectedWallets.get("evm");

      store.getState().refreshWallet("evm");
      const walletAfter = store.getState().connectedWallets.get("evm");

      expect(walletBefore).not.toBe(walletAfter);
      expect(walletBefore?.account).toEqual(walletAfter?.account);
    });

    it("is a no-op for missing platform", () => {
      const { store } = createTestStore();
      const stateBefore = store.getState().connectedWallets;

      store.getState().refreshWallet("move");

      expect(store.getState().connectedWallets).toBe(stateBefore);
    });
  });

  describe("reset", () => {
    it("clears all wallets and storage", async () => {
      const connector = createMockConnector();
      const { storage, store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });
      const clearAllSpy = vi.spyOn(storage, "clearAll");

      await store.getState().connectWallet("test");
      await hydrateStore(store);

      store.getState().reset();

      expect(store.getState().connectedWallets.size).toBe(0);
      expect(store.getState().walletMode).toBe("none");
      expect(store.getState().connected).toBe(false);
      expect(store.getState().connectionStatus).toBe("idle");
      expect(clearAllSpy).toHaveBeenCalled();
      expect(connector.disconnect).toHaveBeenCalled();
    });

    it("calls onReset callback", async () => {
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

    it("sets the disconnect-intent flag", async () => {
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

      expect(store.getState().connectedWallets.size).toBe(1);
    });
  });

  describe("connectOIDCWallet", () => {
    it("delegates to connectWallet", async () => {
      const connector = createMockConnector({
        chainPlatform: "unified",
        id: "google",
        isOIDCBased: true,
        isSmartWallet: true,
      });
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });
      await hydrateStore(store);

      await store.getState().connectOIDCWallet("google");

      expect(store.getState().connectedWallets.size).toBe(1);
    });

    it("disconnects external wallets when connecting smart OIDC wallet", async () => {
      const externalConnector = createMockConnector({
        id: "metamask",
        isSmartWallet: false,
      });
      const oidcConnector = createMockConnector({
        chainPlatform: "unified",
        id: "google",
        isOIDCBased: true,
        isSmartWallet: true,
      });
      const { store } = createTestStore({
        createConnector: vi
          .fn()
          .mockReturnValueOnce(externalConnector)
          .mockReturnValueOnce(externalConnector)
          .mockReturnValue(oidcConnector),
      });

      await store.getState().connectWallet("metamask");
      await hydrateStore(store);
      expect(store.getState().walletMode).toBe("external-wallet");

      await store.getState().connectOIDCWallet("google");
      expect(externalConnector.disconnect).toHaveBeenCalled();
    });

    it("disconnects smart wallets when connecting external OIDC wallet", async () => {
      const smartConnector = createMockConnector({
        chainPlatform: "unified",
        id: "privy",
        isSmartWallet: true,
      });
      const externalOIDCConnector = createMockConnector({
        chainPlatform: "evm",
        id: "oidc-external",
        isOIDCBased: true,
        isSmartWallet: false,
      });
      const { store } = createTestStore({
        createConnector: vi
          .fn()
          .mockReturnValueOnce(smartConnector)
          .mockReturnValueOnce(smartConnector)
          .mockReturnValue(externalOIDCConnector),
      });

      await store.getState().connectWallet("privy");
      await hydrateStore(store);
      expect(store.getState().walletMode).toBe("smart-wallet");

      await store.getState().connectOIDCWallet("oidc-external");
      expect(smartConnector.disconnect).toHaveBeenCalled();
    });

    it("throws when not hydrated", async () => {
      const { store } = createTestStore();

      await expect(store.getState().connectOIDCWallet("test")).rejects.toThrow(
        "OIDC wallet connections require hydration",
      );
    });
  });

  describe("_hydrateWallets", () => {
    it("restores wallets from storage", async () => {
      const account = createMockAccount();
      const connector = createMockConnector({
        getAccount: vi.fn().mockResolvedValue(account),
        id: "metamask",
      });
      const persistent = createMockStorageDriver();
      const session = createMockStorageDriver();
      const storage = new WalletStorage({
        keyPrefix: "test",
        persistent,
        session,
      });

      const wallets = new Map([
        ["evm" as ChainPlatform, { account, connector: createMockConnector({ id: "metamask" }) }],
      ]);
      await storage.setConnectedWallets(wallets);

      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
        storage,
      });

      await hydrateStore(store);

      expect(store.getState().isHydrated).toBe(true);
      expect(store.getState().connectedWallets.size).toBe(1);
      expect(store.getState().connectedWallets.get("evm")?.connector.id).toBe("metamask");
    });

    it("syncs isUserDisconnected from storage", async () => {
      const { storage, store } = createTestStore();
      await storage.markUserDisconnected(true);

      await hydrateStore(store);

      expect(store.getState().isUserDisconnected).toBe(true);
    });

    it("skips OIDC connectors and removes them from storage", async () => {
      const connector = createMockConnector({
        id: "google",
        isOIDCBased: true,
      });
      const persistent = createMockStorageDriver();
      const session = createMockStorageDriver();
      const storage = new WalletStorage({
        keyPrefix: "test",
        persistent,
        session,
      });

      const wallets = new Map([
        [
          "unified" as ChainPlatform,
          {
            account: createMockAccount(),
            connector: createMockConnector({ id: "google" }),
          },
        ],
      ]);
      await storage.setConnectedWallets(wallets);
      const removeSpy = vi.spyOn(storage, "removeConnectedWallet");

      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
        storage,
      });

      await hydrateStore(store);

      expect(store.getState().connectedWallets.size).toBe(0);
      expect(removeSpy).toHaveBeenCalledWith("unified");
    });

    it("handles connector.connect failure gracefully", async () => {
      const connector = createMockConnector({
        connect: vi.fn().mockRejectedValue(new Error("connection failed")),
        id: "broken",
      });
      const persistent = createMockStorageDriver();
      const session = createMockStorageDriver();
      const storage = new WalletStorage({
        keyPrefix: "test",
        persistent,
        session,
      });

      const wallets = new Map([
        [
          "evm" as ChainPlatform,
          {
            account: createMockAccount(),
            connector: createMockConnector({ id: "broken" }),
          },
        ],
      ]);
      await storage.setConnectedWallets(wallets);
      const removeSpy = vi.spyOn(storage, "removeConnectedWallet");

      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
        storage,
      });

      await hydrateStore(store);

      expect(store.getState().connectedWallets.size).toBe(0);
      expect(store.getState().isHydrated).toBe(true);
      expect(removeSpy).toHaveBeenCalledWith("evm");
    });

    it("uses stored account as fallback when getAccount returns null", async () => {
      const storedAccount = createMockAccount({ walletAddress: "0xSTORED" });
      const connector = createMockConnector({
        getAccount: vi.fn().mockResolvedValue(null),
        id: "metamask",
      });
      const persistent = createMockStorageDriver();
      const session = createMockStorageDriver();
      const storage = new WalletStorage({
        keyPrefix: "test",
        persistent,
        session,
      });

      const wallets = new Map([
        [
          "evm" as ChainPlatform,
          {
            account: storedAccount,
            connector: createMockConnector({ id: "metamask" }),
          },
        ],
      ]);
      await storage.setConnectedWallets(wallets);

      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
        storage,
      });

      await hydrateStore(store);

      expect(store.getState().connectedWallets.get("evm")?.account.walletAddress).toBe("0xSTORED");
    });

    it("sets correct wallet mode for external wallets", async () => {
      const connector = createMockConnector({
        id: "metamask",
        isSmartWallet: false,
      });
      const persistent = createMockStorageDriver();
      const session = createMockStorageDriver();
      const storage = new WalletStorage({
        keyPrefix: "test",
        persistent,
        session,
      });

      const wallets = new Map([
        [
          "evm" as ChainPlatform,
          {
            account: createMockAccount(),
            connector: createMockConnector({ id: "metamask" }),
          },
        ],
      ]);
      await storage.setConnectedWallets(wallets);

      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
        storage,
      });

      await hydrateStore(store);
      expect(store.getState().walletMode).toBe("external-wallet");
    });
  });

  describe("connection status", () => {
    it("transitions to connecting on connectWallet start", async () => {
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
      expect(store.getState().activeConnectorId).toBe("test");

      resolveConnect!();
      await connectPromise;
      expect(store.getState().connectionStatus).toBe("success");
    });

    it("setConnectionError sets error status", () => {
      const { store } = createTestStore();

      store.getState().setConnectionError("something broke");
      expect(store.getState().connectionStatus).toBe("error");
      expect(store.getState().connectionError).toBe("something broke");
    });

    it("setConnectionError with null resets to idle", () => {
      const { store } = createTestStore();

      store.getState().setConnectionError("error");
      store.getState().setConnectionError(null);

      expect(store.getState().connectionStatus).toBe("idle");
      expect(store.getState().connectionError).toBeNull();
    });

    it("resetConnectionStatus clears everything", () => {
      const { store } = createTestStore();

      store.getState().setConnectionStatus("connecting", "metamask");
      store.getState().resetConnectionStatus();

      expect(store.getState().connectionStatus).toBe("idle");
      expect(store.getState().connectionError).toBeNull();
      expect(store.getState().activeConnectorId).toBeNull();
    });
  });

  describe("isWalletConnected", () => {
    it("returns true when wallet exists for platform", async () => {
      const connector = createMockConnector();
      const { store } = createTestStore({
        createConnector: vi.fn().mockReturnValue(connector),
      });

      await store.getState().connectWallet("test");
      expect(store.getState().isWalletConnected("evm")).toBe(true);
    });

    it("returns false when no wallet for platform", () => {
      const { store } = createTestStore();
      expect(store.getState().isWalletConnected("svm")).toBe(false);
    });
  });
});
