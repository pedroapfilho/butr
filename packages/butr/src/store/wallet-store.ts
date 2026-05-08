import { createStore } from "zustand/vanilla";
import { devtools } from "zustand/middleware";
import type { ChainPlatform, ConnectedWallet, WalletManagerConfig, WalletMode } from "../types";
import { WalletStorage } from "../storage";
import {
  hydrateFromStorage,
  isProduction,
  logStorageError,
  resolveTargetKey,
  run,
} from "./wallet-store-helpers";
import type { InternalWalletState } from "./wallet-store-helpers";

const CONNECT_TIMEOUT_MS = 90_000;

type ExtractState<S> = S extends { getState: () => infer T } ? T : never;

type WalletStore = ReturnType<typeof createWalletStore>;
type WalletStoreState = ExtractState<WalletStore>;

const createWalletStore = (config: WalletManagerConfig) => {
  const storageKeyPrefix = config.storageKeyPrefix || "butr";

  const storage =
    config.storage ||
    new WalletStorage({
      keyPrefix: storageKeyPrefix,
    });

  return createStore<InternalWalletState>()(
    devtools(
      (set, get) => ({
        // Initial state
        connected: false,
        connectedWallets: new Map(),
        connecting: false,
        hasAnyWallet: false,
        isHydrated: false,
        isUserDisconnected: false,
        walletMode: "none",
        wallets: [],

        // Connection status tracking
        _config: config,
        _hydrateWallets: async () => {
          const result = await hydrateFromStorage(storage, config.createConnector);

          void run(
            () => storage.setWalletMode(result.walletMode),
            logStorageError("failed to persist wallet mode"),
          );

          set(
            {
              connected: result.connected,
              connectedWallets: result.connectedWallets,
              connecting: false,
              hasAnyWallet: result.hasAnyWallet,
              isHydrated: true,
              isUserDisconnected: result.isUserDisconnected,
              walletMode: result.walletMode,
              wallets: result.wallets,
            },
            false,
          );
        },
        _markUserDisconnected: (value: boolean) => {
          set({ isUserDisconnected: value }, false);
          void run(
            () => storage.markUserDisconnected(value),
            logStorageError("failed to persist disconnect intent"),
          );
        },

        _persistConnectedWallets: (wallets: Map<ChainPlatform, ConnectedWallet>) => {
          void run(
            () => storage.setConnectedWallets(wallets),
            logStorageError("failed to persist wallets"),
          );
        },
        _setWalletMode: (mode: WalletMode) => {
          set({ walletMode: mode }, false);
          void run(
            () => storage.setWalletMode(mode),
            logStorageError("failed to persist wallet mode"),
          );
        },

        _storage: storage,

        _updateDerivedState: () => {
          const currentState = get();
          const wallets = [...currentState.connectedWallets.values()];
          const hasAnyWallet = currentState.connectedWallets.size > 0;
          const connecting = false;
          const connected = hasAnyWallet;

          set({ connected, connecting, hasAnyWallet, wallets }, false);
        },

        activeConnectorId: null,

        connectionError: null,

        connectionStatus: "idle",

        connectOIDCWallet: async (id, onSuccess, onError) => {
          const state = get();
          if (!state.isHydrated) {
            throw new Error("OIDC wallet connections require hydration to complete first");
          }

          const connector = config.createConnector(id);
          if (!connector) {
            throw new Error(`Failed to create connector for ${id}`);
          }

          if (connector.isSmartWallet && state.walletMode === "external-wallet") {
            const platformsToDisconnect = [...state.connectedWallets.keys()];
            for (const platform of platformsToDisconnect) {
              state.disconnectWallet(platform);
            }
          }

          if (!connector.isSmartWallet && state.walletMode === "smart-wallet") {
            const platformsToDisconnect = [...state.connectedWallets.keys()];
            for (const platform of platformsToDisconnect) {
              state.disconnectWallet(platform);
            }
          }

          await state.connectWallet(id, onSuccess, onError);
        },

        connectWallet: async (id, onSuccess, onError) => {
          get()._markUserDisconnected(false);

          const walletState = get();
          const connector = config.createConnector(id);
          if (!connector) {
            throw new Error(`Failed to create connector for ${id}`);
          }

          const isSmartWallet = connector.isSmartWallet === true;
          const isExternalWallet = !isSmartWallet;

          // Auto-disconnect incompatible wallets
          if (isSmartWallet && walletState.walletMode === "external-wallet") {
            const platformsToDisconnect = [...walletState.connectedWallets.keys()];
            for (const platform of platformsToDisconnect) {
              walletState.disconnectWallet(platform);
            }
          }

          if (isExternalWallet && walletState.walletMode === "smart-wallet") {
            const platformsToDisconnect = [...walletState.connectedWallets.keys()];
            for (const platform of platformsToDisconnect) {
              walletState.disconnectWallet(platform);
            }
          }

          set(
            {
              activeConnectorId: id,
              connectionError: null,
              connectionStatus: "connecting",
            },
            false,
          );

          try {
            const connectPromise = connector.connect();
            // oxlint-disable-next-line promise/prefer-await-to-then -- suppress unhandled rejection; we await via Promise.race below
            void connectPromise.catch(() => {});
            await Promise.race([
              connectPromise,
              new Promise((_, reject) => {
                setTimeout(() => {
                  reject(new Error("Connection timeout"));
                }, CONNECT_TIMEOUT_MS);
              }),
            ]);
            const account = await connector.getAccount();
            if (!account) {
              throw new Error("Failed to get account");
            }

            const connectedWallet: ConnectedWallet = { account, connector };

            set((prev) => {
              const existingWallet = prev.connectedWallets.get(connector.chainPlatform);
              if (
                existingWallet &&
                existingWallet.account.walletAddress.toLowerCase() ===
                  connectedWallet.account.walletAddress.toLowerCase()
              ) {
                return {
                  connectionStatus: "success" as const,
                };
              }

              const newWallets = new Map([
                ...prev.connectedWallets,
                [connector.chainPlatform, connectedWallet],
              ]);

              const wallets = [...newWallets.values()];
              const hasAnyWallet = newWallets.size > 0;

              return {
                connected: hasAnyWallet,
                connectedWallets: newWallets,
                connecting: false,
                connectionStatus: "success" as const,
                hasAnyWallet,
                wallets,
              };
            }, false);

            const updatedWallets = get().connectedWallets;
            get()._persistConnectedWallets(updatedWallets);

            if (isSmartWallet && walletState.walletMode !== "smart-wallet") {
              get()._setWalletMode("smart-wallet");
            } else if (isExternalWallet && walletState.walletMode !== "external-wallet") {
              get()._setWalletMode("external-wallet");
            }

            config.onConnect?.(connectedWallet);
            onSuccess?.(connectedWallet);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Connection failed";
            set({ connectionError: errorMessage, connectionStatus: "error" }, false);
            try {
              await connector.disconnect?.();
            } catch (disconnectError: unknown) {
              console.warn("[butr] disconnect during error recovery failed:", disconnectError);
            }
            onError?.(error as Error);
            throw error;
          }
        },

        disconnectWallet: (chainPlatform) => {
          get()._markUserDisconnected(true);

          const disconnectState = get();
          if (!disconnectState.isHydrated) {
            return;
          }

          const targetKey = resolveTargetKey(disconnectState.connectedWallets, chainPlatform);

          if (!targetKey) {
            return;
          }

          const wallet = disconnectState.connectedWallets.get(targetKey);
          if (wallet) {
            void run(() => wallet.connector.disconnect?.() ?? Promise.resolve(), console.error);
          }

          set((prev) => {
            const newWallets = new Map(prev.connectedWallets);
            newWallets.delete(targetKey);

            const wallets = [...newWallets.values()];
            const hasAnyWallet = newWallets.size > 0;
            const walletMode = newWallets.size === 0 ? "none" : prev.walletMode;

            return {
              connected: hasAnyWallet,
              connectedWallets: newWallets,
              connecting: false,
              hasAnyWallet,
              walletMode,
              wallets,
            };
          }, false);

          if (get().connectedWallets.size === 0) {
            void run(() => storage.clearAll(), logStorageError("failed to clear storage"));
          } else {
            get()._persistConnectedWallets(get().connectedWallets);
          }

          config.onDisconnect?.(chainPlatform);
        },

        getConnectorInstance: (id) => {
          return config.createConnector(id);
        },

        getWalletByPlatform: (chainPlatform) => {
          const state = get();
          const directWallet = state.connectedWallets.get(chainPlatform);
          if (directWallet) {
            return directWallet;
          }

          if (chainPlatform === "unified") {
            return state.connectedWallets.get("unified");
          }

          const unifiedWallet = state.connectedWallets.get("unified");
          if (!unifiedWallet) {
            return undefined;
          }

          if (chainPlatform === "evm" || chainPlatform === "svm") {
            const resolvedAccount =
              unifiedWallet.connector.getAccountForPlatform?.(chainPlatform) ??
              unifiedWallet.account;

            return {
              ...unifiedWallet,
              account: resolvedAccount,
            };
          }

          return undefined;
        },

        getWalletForOperation: (chainPlatform) => {
          const wallet = get().getWalletByPlatform(chainPlatform);
          if (wallet) {
            wallet.connector.setActiveChainPlatform?.(chainPlatform);
            const resolvedAccount = wallet.connector.getAccountForPlatform?.(chainPlatform);

            if (resolvedAccount && resolvedAccount.walletAddress !== wallet.account.walletAddress) {
              return {
                ...wallet,
                account: resolvedAccount,
              };
            }

            return wallet;
          }
          return undefined;
        },

        isWalletConnected: (chainPlatform) => {
          return get().getWalletByPlatform(chainPlatform) !== undefined;
        },

        refreshWallet: (chainPlatform) => {
          set((prev) => {
            const targetKey = resolveTargetKey(prev.connectedWallets, chainPlatform);

            if (!targetKey) {
              return prev;
            }

            const wallet = prev.connectedWallets.get(targetKey);
            if (!wallet) {
              return prev;
            }

            const newWallets = new Map([...prev.connectedWallets, [targetKey, { ...wallet }]]);

            const wallets = [...newWallets.values()];
            const hasAnyWallet = newWallets.size > 0;

            return {
              connected: hasAnyWallet,
              connectedWallets: newWallets,
              connecting: false,
              hasAnyWallet,
              wallets,
            };
          }, false);
        },

        reset: () => {
          get()._markUserDisconnected(true);

          const resetState = get();
          if (!resetState.isHydrated) {
            return;
          }

          for (const wallet of resetState.connectedWallets.values()) {
            void run(() => wallet.connector.disconnect?.() ?? Promise.resolve(), console.error);
          }

          void run(() => storage.clearAll(), logStorageError("failed to clear storage"));

          // Fire the consumer-provided reset callback (e.g., clear auth tokens)
          if (config.onReset) {
            const onReset = config.onReset;
            void run(() => Promise.resolve(onReset()), console.error);
          }

          set(
            {
              activeConnectorId: null,
              connected: false,
              connectedWallets: new Map(),
              connecting: false,
              connectionError: null,
              connectionStatus: "idle",
              hasAnyWallet: false,
              walletMode: "none",
              wallets: [],
            },
            false,
          );
        },

        resetConnectionStatus: () => {
          set(
            {
              activeConnectorId: null,
              connectionError: null,
              connectionStatus: "idle",
            },
            false,
          );
        },

        setConnectionError: (error) => {
          set(
            {
              connectionError: error,
              connectionStatus: error ? "error" : "idle",
            },
            false,
          );
        },

        setConnectionStatus: (status, connectorId = null) => {
          set({ activeConnectorId: connectorId, connectionStatus: status }, false);
        },

        updateWalletAccount: (chainPlatform, newAccount) => {
          set((prev) => {
            const targetKey = resolveTargetKey(prev.connectedWallets, chainPlatform);

            if (!targetKey) {
              return prev;
            }

            const wallet = prev.connectedWallets.get(targetKey);
            if (!wallet) {
              return prev;
            }

            // Skip update when the account hasn't actually changed.
            // Prevents unnecessary Map churn that cascades through
            // useSyncExternalStore subscribers (e.g. useWalletForOperation
            // in TradeWidget), which can trigger Error #185.
            if (
              wallet.account.walletAddress === newAccount.walletAddress &&
              wallet.account.chain.id === newAccount.chain.id
            ) {
              return prev;
            }

            const updatedWallet: ConnectedWallet = {
              ...wallet,
              account: newAccount,
            };

            const newWallets = new Map([...prev.connectedWallets, [targetKey, updatedWallet]]);

            const wallets = [...newWallets.values()];
            const hasAnyWallet = newWallets.size > 0;

            return {
              connected: hasAnyWallet,
              connectedWallets: newWallets,
              connecting: false,
              hasAnyWallet,
              wallets,
            };
          }, false);

          get()._persistConnectedWallets(get().connectedWallets);
        },
      }),
      { enabled: !isProduction(), name: "butr-wallet" },
    ),
  );
};

export type { ConnectionStatus } from "./wallet-store-helpers";
export type { WalletStore, WalletStoreState };
export { createWalletStore };
