import { createStore } from "zustand/vanilla";
import { devtools } from "zustand/middleware";
import type {
  Account,
  ChainPlatform,
  ConnectedWallet,
  UIConnector,
  WalletManagerConfig,
  WalletMode,
} from "../types";
import { type WalletPersistence, WalletStorage } from "../storage";

/** Connection status for wallet connection flows */
type ConnectionStatus = "idle" | "connecting" | "success" | "error";

const CONNECT_TIMEOUT_MS = 90_000;

/** Public state and methods exposed to components */
type WalletState = {
  activeConnectorId: string | null;
  connected: boolean;
  // Public State
  connectedWallets: Map<ChainPlatform, ConnectedWallet>;
  connecting: boolean;
  connectionError: string | null;
  // Connection status tracking (for UI coordination)
  connectionStatus: ConnectionStatus;
  connectOIDCWallet: (
    id: string,
    onSuccess?: (wallet: ConnectedWallet) => void,
    onError?: (error: Error) => void,
  ) => Promise<void>;
  // Public Actions
  connectWallet: (
    id: string,
    onSuccess?: (wallet: ConnectedWallet) => void,
    onError?: (error: Error) => void,
  ) => Promise<void>;

  disconnectWallet: (chainPlatform: ChainPlatform) => void;
  getConnectorInstance: (id: string) => UIConnector | null;
  getWalletByPlatform: (chainPlatform: ChainPlatform) => ConnectedWallet | undefined;

  getWalletForOperation: (chainPlatform: ChainPlatform) => ConnectedWallet | undefined;
  hasAnyWallet: boolean;
  isHydrated: boolean;
  /** Reactive mirror of the session-scoped disconnect-intent flag. */
  isUserDisconnected: boolean;
  isWalletConnected: (chainPlatform: ChainPlatform) => boolean;
  refreshWallet: (chainPlatform: ChainPlatform) => void;
  reset: () => void;
  resetConnectionStatus: () => void;
  setConnectionError: (error: string | null) => void;
  // Connection status actions
  setConnectionStatus: (status: ConnectionStatus, connectorId?: string | null) => void;

  updateWalletAccount: (chainPlatform: ChainPlatform, newAccount: Account) => void;
  walletMode: WalletMode;
  wallets: ConnectedWallet[];
};

/** Internal state including private methods and config */
type InternalWalletState = WalletState & {
  _config: WalletManagerConfig;
  _hydrateWallets: () => Promise<void>;

  _markUserDisconnected: (value: boolean) => void;
  _persistConnectedWallets: (wallets: Map<ChainPlatform, ConnectedWallet>) => void;
  _setWalletMode: (mode: WalletMode) => void;
  _storage: WalletPersistence;
  _updateDerivedState: () => void;
};

type ExtractState<S> = S extends { getState: () => infer T } ? T : never;

type WalletStore = ReturnType<typeof createWalletStore>;
type WalletStoreState = ExtractState<WalletStore>;

const logStorageError = (context: string) => (error: unknown) => {
  console.warn(`[butr] ${context}:`, error);
};

const isProduction = (): boolean => {
  try {
    const proc = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process;
    return proc?.env?.NODE_ENV === "production";
  } catch {
    return false;
  }
};

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
          const [stored, persistedMode, userDisconnected] = await Promise.all([
            storage.getConnectedWallets(),
            storage.getWalletMode(),
            storage.isUserDisconnected(),
          ]);
          const walletsMap = new Map<ChainPlatform, ConnectedWallet>();

          let hasSmartWallet = false;
          let hasExternalWallet = false;

          for (const [platform, walletData] of Object.entries(stored)) {
            if (
              typeof walletData === "object" &&
              "connectorId" in walletData &&
              "account" in walletData &&
              typeof walletData.connectorId === "string"
            ) {
              const connector = config.createConnector(walletData.connectorId);
              if (connector) {
                // Skip hydration for OIDC-based connectors (like Privy).
                // They have their own session restoration flow.
                if (connector.isOIDCBased) {
                  await storage
                    .removeConnectedWallet(platform as ChainPlatform)
                    .catch(logStorageError("failed to remove OIDC entry"));
                  continue;
                }

                try {
                  await connector.connect();
                  const freshAccount = await connector.getAccount();
                  const accountToUse = freshAccount || walletData.account;

                  walletsMap.set(platform as ChainPlatform, {
                    connector,
                    account: accountToUse,
                  });

                  if (connector.isSmartWallet) {
                    hasSmartWallet = true;
                  } else {
                    hasExternalWallet = true;
                  }
                } catch (error) {
                  console.warn(
                    `[butr] failed to restore connector ${walletData.connectorId}:`,
                    error,
                  );
                  await storage
                    .removeConnectedWallet(platform as ChainPlatform)
                    .catch(logStorageError("failed to remove broken entry"));
                }
              } else {
                console.warn(`[butr] could not instantiate connector ${walletData.connectorId}`);
              }
            } else {
              console.warn(`[butr] validation failed for ${platform}, walletData:`, { walletData });
            }
          }

          // Determine wallet mode
          let newWalletMode: WalletMode = "none";
          if (hasSmartWallet && !hasExternalWallet) {
            newWalletMode = "smart-wallet";
          } else if (hasExternalWallet && !hasSmartWallet) {
            newWalletMode = "external-wallet";
          } else if (walletsMap.size === 0) {
            newWalletMode = persistedMode;
          }
          void storage
            .setWalletMode(newWalletMode)
            .catch(logStorageError("failed to persist wallet mode"));

          const wallets = Array.from(walletsMap.values());
          const hasAnyWallet = walletsMap.size > 0;
          const connected = hasAnyWallet;

          set(
            {
              connectedWallets: walletsMap,
              wallets,
              hasAnyWallet,
              walletMode: newWalletMode,
              connecting: false,
              connected,
              isHydrated: true,
              isUserDisconnected: userDisconnected,
            },
            false,
          );
        },
        _markUserDisconnected: (value: boolean) => {
          set({ isUserDisconnected: value }, false);
          void storage
            .markUserDisconnected(value)
            .catch(logStorageError("failed to persist disconnect intent"));
        },

        _persistConnectedWallets: (wallets: Map<ChainPlatform, ConnectedWallet>) => {
          void storage
            .setConnectedWallets(wallets)
            .catch(logStorageError("failed to persist wallets"));
        },
        _setWalletMode: (mode: WalletMode) => {
          set({ walletMode: mode }, false);
          void storage.setWalletMode(mode).catch(logStorageError("failed to persist wallet mode"));
        },

        _storage: storage,

        _updateDerivedState: () => {
          const state = get();
          const wallets = Array.from(state.connectedWallets.values());
          const hasAnyWallet = state.connectedWallets.size > 0;
          const connecting = false;
          const connected = hasAnyWallet;

          set({ wallets, hasAnyWallet, connecting, connected }, false);
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
          if (!connector) throw new Error(`Failed to create connector for ${id}`);

          if (connector.isSmartWallet && state.walletMode === "external-wallet") {
            const platformsToDisconnect = Array.from(state.connectedWallets.keys());
            for (const platform of platformsToDisconnect) {
              state.disconnectWallet(platform);
            }
          }

          if (!connector.isSmartWallet && state.walletMode === "smart-wallet") {
            const platformsToDisconnect = Array.from(state.connectedWallets.keys());
            for (const platform of platformsToDisconnect) {
              state.disconnectWallet(platform);
            }
          }

          await state.connectWallet(id, onSuccess, onError);
        },

        connectWallet: async (id, onSuccess, onError) => {
          get()._markUserDisconnected(false);

          const state = get();
          const connector = config.createConnector(id);
          if (!connector) throw new Error(`Failed to create connector for ${id}`);

          const isSmartWallet = connector.isSmartWallet === true;
          const isExternalWallet = !isSmartWallet;

          // Auto-disconnect incompatible wallets
          if (isSmartWallet && state.walletMode === "external-wallet") {
            const platformsToDisconnect = Array.from(state.connectedWallets.keys());
            for (const platform of platformsToDisconnect) {
              state.disconnectWallet(platform);
            }
          }

          if (isExternalWallet && state.walletMode === "smart-wallet") {
            const platformsToDisconnect = Array.from(state.connectedWallets.keys());
            for (const platform of platformsToDisconnect) {
              state.disconnectWallet(platform);
            }
          }

          set(
            {
              connectionStatus: "connecting",
              activeConnectorId: id,
              connectionError: null,
            },
            false,
          );

          try {
            const connectPromise = connector.connect();
            connectPromise.catch(() => {});
            await Promise.race([
              connectPromise,
              new Promise((_, reject) => {
                setTimeout(() => {
                  reject(new Error("Connection timeout"));
                }, CONNECT_TIMEOUT_MS);
              }),
            ]);
            const account = await connector.getAccount();
            if (!account) throw new Error("Failed to get account");

            const connectedWallet: ConnectedWallet = { connector, account };

            set((state) => {
              const existingWallet = state.connectedWallets.get(connector.chainPlatform);
              if (
                existingWallet &&
                existingWallet.account.walletAddress.toLowerCase() ===
                  connectedWallet.account.walletAddress.toLowerCase()
              ) {
                return {
                  connectionStatus: "success" as const,
                };
              }

              const newWallets = new Map(state.connectedWallets);
              newWallets.set(connector.chainPlatform, connectedWallet);

              const wallets = Array.from(newWallets.values());
              const hasAnyWallet = newWallets.size > 0;

              return {
                connectedWallets: newWallets,
                wallets,
                hasAnyWallet,
                connecting: false,
                connected: hasAnyWallet,
                connectionStatus: "success" as const,
              };
            }, false);

            const updatedWallets = get().connectedWallets;
            get()._persistConnectedWallets(updatedWallets);

            if (isSmartWallet && state.walletMode !== "smart-wallet") {
              get()._setWalletMode("smart-wallet");
            } else if (isExternalWallet && state.walletMode !== "external-wallet") {
              get()._setWalletMode("external-wallet");
            }

            config.onConnect?.(connectedWallet);
            onSuccess?.(connectedWallet);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Connection failed";
            set({ connectionStatus: "error", connectionError: errorMessage }, false);
            await connector.disconnect?.().catch((e: unknown) => {
              console.warn("[butr] disconnect during error recovery failed:", e);
            });
            onError?.(error as Error);
            throw error;
          }
        },

        disconnectWallet: (chainPlatform) => {
          get()._markUserDisconnected(true);

          const state = get();
          if (!state.isHydrated) return;

          const targetKey = state.connectedWallets.has(chainPlatform)
            ? chainPlatform
            : chainPlatform === "evm" || chainPlatform === "svm"
              ? ("unified" as ChainPlatform)
              : undefined;

          if (!targetKey) return;

          const wallet = state.connectedWallets.get(targetKey);
          if (wallet) {
            wallet.connector.disconnect?.().catch(console.error);
          }

          set((state) => {
            const newWallets = new Map(state.connectedWallets);
            newWallets.delete(targetKey);

            const wallets = Array.from(newWallets.values());
            const hasAnyWallet = newWallets.size > 0;
            const walletMode = newWallets.size === 0 ? "none" : state.walletMode;

            return {
              connectedWallets: newWallets,
              wallets,
              hasAnyWallet,
              walletMode,
              connecting: false,
              connected: hasAnyWallet,
            };
          }, false);

          if (get().connectedWallets.size === 0) {
            void storage.clearAll().catch(logStorageError("failed to clear storage"));
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
          if (directWallet) return directWallet;

          if (chainPlatform === "unified") {
            return state.connectedWallets.get("unified");
          }

          const unifiedWallet = state.connectedWallets.get("unified");
          if (!unifiedWallet) return undefined;

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
          set((state) => {
            const targetKey = state.connectedWallets.has(chainPlatform)
              ? chainPlatform
              : chainPlatform === "evm" || chainPlatform === "svm"
                ? ("unified" as ChainPlatform)
                : undefined;

            if (!targetKey) return state;

            const wallet = state.connectedWallets.get(targetKey);
            if (!wallet) return state;

            const newWallets = new Map(state.connectedWallets);
            newWallets.set(targetKey, { ...wallet });

            const wallets = Array.from(newWallets.values());
            const hasAnyWallet = newWallets.size > 0;

            return {
              connectedWallets: newWallets,
              wallets,
              hasAnyWallet,
              connecting: false,
              connected: hasAnyWallet,
            };
          }, false);
        },

        reset: () => {
          get()._markUserDisconnected(true);

          const state = get();
          if (!state.isHydrated) return;

          for (const wallet of state.connectedWallets.values()) {
            wallet.connector.disconnect?.().catch(console.error);
          }

          void storage.clearAll().catch(logStorageError("failed to clear storage"));

          // Fire the consumer-provided reset callback (e.g., clear auth tokens)
          if (config.onReset) {
            Promise.resolve(config.onReset()).catch(console.error);
          }

          set(
            {
              connectedWallets: new Map(),
              wallets: [],
              hasAnyWallet: false,
              walletMode: "none",
              connecting: false,
              connected: false,
              connectionStatus: "idle",
              connectionError: null,
              activeConnectorId: null,
            },
            false,
          );
        },

        resetConnectionStatus: () => {
          set(
            {
              connectionStatus: "idle",
              connectionError: null,
              activeConnectorId: null,
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
          set({ connectionStatus: status, activeConnectorId: connectorId }, false);
        },

        updateWalletAccount: (chainPlatform, newAccount) => {
          set((state) => {
            const targetKey = state.connectedWallets.has(chainPlatform)
              ? chainPlatform
              : chainPlatform === "evm" || chainPlatform === "svm"
                ? ("unified" as ChainPlatform)
                : undefined;

            if (!targetKey) return state;

            const wallet = state.connectedWallets.get(targetKey);
            if (!wallet) return state;

            // Skip update when the account hasn't actually changed.
            // Prevents unnecessary Map churn that cascades through
            // useSyncExternalStore subscribers (e.g. useWalletForOperation
            // in TradeWidget), which can trigger Error #185.
            if (
              wallet.account.walletAddress === newAccount.walletAddress &&
              wallet.account.chain.id === newAccount.chain.id
            ) {
              return state;
            }

            const updatedWallet: ConnectedWallet = {
              ...wallet,
              account: newAccount,
            };

            const newWallets = new Map(state.connectedWallets);
            newWallets.set(targetKey, updatedWallet);

            const wallets = Array.from(newWallets.values());
            const hasAnyWallet = newWallets.size > 0;

            return {
              connectedWallets: newWallets,
              wallets,
              hasAnyWallet,
              connecting: false,
              connected: hasAnyWallet,
            };
          }, false);

          get()._persistConnectedWallets(get().connectedWallets);
        },
      }),
      { enabled: !isProduction(), name: "butr-wallet" },
    ),
  );
};

export type { ConnectionStatus, WalletStore, WalletStoreState };
export { createWalletStore };
