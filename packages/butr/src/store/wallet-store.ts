import { createStore } from "zustand/vanilla";
import { devtools } from "zustand/middleware";
import type {
  Account,
  ChainPlatform,
  ConnectedWallet,
  Connector,
  WalletManagerConfig,
} from "../types";
import type { ConnectionError } from "../types/errors";
import { mapConnectionError } from "../types/errors";
import { WalletStorage } from "../storage";
import type { WalletPersistence } from "../storage";
import { hydrateFromStorage, isProduction, logStorageError, run } from "./wallet-store-helpers";
import { type Event, type State, initialState, reducer } from "./reducer";

const CONNECT_TIMEOUT_MS = 90_000;

type ExtractState<S> = S extends { getState: () => infer T } ? T : never;

type RuntimeMembers = {
  _config: WalletManagerConfig;
  _hydrateWallets: () => Promise<void>;
  _markUserDisconnected: (value: boolean) => void;
  _storage: WalletPersistence;
  connectWallet: (
    connectorId: string,
    onSuccess?: (wallet: ConnectedWallet) => void,
    onError?: (error: Error) => void,
  ) => Promise<void>;
  disconnectWallet: (connectorId: string) => void;
  getConnectorInstance: (id: string) => ReturnType<WalletManagerConfig["createConnector"]>;
  refreshWallet: (connectorId: string) => void;
  reset: () => void;
  resetConnectionStatus: () => void;
  setActiveConnector: (connectorId: string | null) => void;
  setConnectionError: (error: ConnectionError | null) => void;
  setConnectionStatus: (status: State["connectionStatus"], connectorId?: string | null) => void;
  setSelection: (chainPlatform: ChainPlatform, connectorId: string | null) => void;
  updateWalletAccount: (connectorId: string, account: Account) => void;
};

type WalletStore = ReturnType<typeof createWalletStore>;
type WalletStoreState = ExtractState<WalletStore>;

const createWalletStore = (config: WalletManagerConfig) => {
  const storageKeyPrefix = config.storageKeyPrefix || "butr";
  const storage = config.storage || new WalletStorage({ keyPrefix: storageKeyPrefix });

  // Closure-held registry of connector subscriptions. Keyed by connectorId,
  // value is the unsubscribe function returned by `Connector.subscribe`.
  // Lives outside the reducer state because these are side-effect handles,
  // not data anyone should subscribe to.
  const unsubscribers = new Map<string, () => void>();

  return createStore<State & RuntimeMembers>()(
    devtools(
      (set, get) => {
        const dispatch = (event: Event) => {
          set((prev) => reducer(prev, event), false);
        };

        const persistPool = () => {
          void run(() => storage.setPool(get().pool), logStorageError("failed to persist pool"));
        };

        const persistSelection = () => {
          void run(
            () => storage.setSelection(get().selection),
            logStorageError("failed to persist selection"),
          );
        };

        const persistActive = () => {
          void run(
            () => storage.setActiveConnectorId(get().activeConnectorId),
            logStorageError("failed to persist active connector"),
          );
        };

        const unsubscribeFromConnector = (connectorId: string) => {
          const unsub = unsubscribers.get(connectorId);
          if (!unsub) {
            return;
          }
          try {
            unsub();
          } catch (error: unknown) {
            console.warn("[butr] unsubscribe threw:", error);
          }
          unsubscribers.delete(connectorId);
        };

        const unsubscribeAll = () => {
          // Snapshot the keys before iterating because unsubscribeFromConnector
          // mutates the underlying map.
          const ids: Array<string> = [];
          for (const id of unsubscribers.keys()) {
            ids.push(id);
          }
          for (const connectorId of ids) {
            unsubscribeFromConnector(connectorId);
          }
        };

        const subscribeToConnector = (connectorId: string, connector: Connector) => {
          if (!connector.subscribe) {
            return;
          }
          unsubscribeFromConnector(connectorId);
          try {
            const unsub = connector.subscribe((event) => {
              switch (event.type) {
                case "accountChanged": {
                  dispatch({ account: event.account, connectorId, type: "ACCOUNT_UPDATED" });
                  persistPool();
                  break;
                }
                case "disconnected": {
                  // Mirror an external disconnect into the reducer.
                  // Don't call connector.disconnect — the wallet already did
                  // the work; just unwire and persist.
                  dispatch({ connectorId, type: "DISCONNECTED" });
                  unsubscribeFromConnector(connectorId);
                  if (get().pool.size === 0) {
                    void run(() => storage.clearAll(), logStorageError("failed to clear storage"));
                  } else {
                    persistPool();
                    persistSelection();
                    persistActive();
                  }
                  config.onDisconnect?.(connector.chainPlatform);
                  break;
                }
                default: {
                  const _exhaustive: never = event;
                  void _exhaustive;
                }
              }
            });
            unsubscribers.set(connectorId, unsub);
          } catch (error: unknown) {
            console.warn(`[butr] subscribe failed for ${connectorId}:`, error);
          }
        };

        return {
          ...initialState,
          _config: config,
          _hydrateWallets: async () => {
            const result = await hydrateFromStorage(storage, config.createConnector);
            dispatch({
              activeConnectorId: result.activeConnectorId,
              isUserDisconnected: result.isUserDisconnected,
              pool: result.pool,
              selection: result.selection,
              type: "HYDRATED",
            });
            // Wire up wallet-side event subscriptions for every restored
            // connector so account/chain swaps after a refresh keep the
            // reducer in sync without consumer effort.
            for (const [connectorId, wallet] of result.pool) {
              subscribeToConnector(connectorId, wallet.connector);
            }
            // Persist any reconciled values back so future loads stay consistent.
            persistSelection();
            persistActive();
          },
          _markUserDisconnected: (value: boolean) => {
            dispatch({ type: "USER_DISCONNECTED_SET", value });
            void run(
              () => storage.markUserDisconnected(value),
              logStorageError("failed to persist disconnect intent"),
            );
          },
          _storage: storage,

          connectWallet: async (connectorId, onSuccess, onError) => {
            get()._markUserDisconnected(false);

            const connector = config.createConnector(connectorId);
            if (!connector) {
              throw new Error(`Failed to create connector for ${connectorId}`);
            }

            dispatch({ connectorId, type: "CONNECT_STARTED" });

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

              // Pull all known accounts when the connector supports it.
              const fetchedAccounts = connector.getAccounts
                ? await connector.getAccounts().catch(() => null)
                : null;
              const accounts =
                fetchedAccounts && fetchedAccounts.length > 0 ? fetchedAccounts : [account];

              const entry: ConnectedWallet = { account, accounts, connector };
              dispatch({ connectorId, entry, type: "CONNECT_SUCCEEDED" });

              subscribeToConnector(connectorId, connector);

              persistPool();
              persistSelection();
              persistActive();

              config.onConnect?.(entry);
              onSuccess?.(entry);
            } catch (error) {
              dispatch({ error: mapConnectionError(error), type: "CONNECT_FAILED" });
              try {
                await connector.disconnect?.();
              } catch (disconnectError: unknown) {
                console.warn("[butr] disconnect during error recovery failed:", disconnectError);
              }
              onError?.(error as Error);
              throw error;
            }
          },

          disconnectWallet: (connectorId) => {
            get()._markUserDisconnected(true);

            const state = get();
            if (!state.isHydrated) {
              return;
            }
            const wallet = state.pool.get(connectorId);
            if (!wallet) {
              return;
            }

            unsubscribeFromConnector(connectorId);

            void run(() => wallet.connector.disconnect?.() ?? Promise.resolve(), console.error);

            const platform = wallet.connector.chainPlatform;
            dispatch({ connectorId, type: "DISCONNECTED" });

            if (get().pool.size === 0) {
              void run(() => storage.clearAll(), logStorageError("failed to clear storage"));
            } else {
              persistPool();
              persistSelection();
              persistActive();
            }

            config.onDisconnect?.(platform);
          },

          getConnectorInstance: (id) => config.createConnector(id),

          refreshWallet: (connectorId) => {
            dispatch({ connectorId, type: "WALLET_REFRESHED" });
          },

          reset: () => {
            get()._markUserDisconnected(true);

            const state = get();
            if (!state.isHydrated) {
              return;
            }

            unsubscribeAll();

            for (const wallet of state.pool.values()) {
              void run(() => wallet.connector.disconnect?.() ?? Promise.resolve(), console.error);
            }

            void run(() => storage.clearAll(), logStorageError("failed to clear storage"));

            if (config.onReset) {
              const onReset = config.onReset;
              void run(() => Promise.resolve(onReset()), console.error);
            }

            dispatch({ type: "RESET" });
          },

          resetConnectionStatus: () => {
            dispatch({ type: "STATUS_RESET" });
          },

          setActiveConnector: (connectorId) => {
            dispatch({ connectorId, type: "ACTIVE_CHANGED" });
            persistActive();
          },

          setConnectionError: (error) => {
            dispatch({ error, type: "ERROR_SET" });
          },

          setConnectionStatus: (status, connectorId = null) => {
            dispatch({ connectorId, status, type: "STATUS_SET" });
          },

          setSelection: (chainPlatform, connectorId) => {
            dispatch({ chainPlatform, connectorId, type: "SELECTION_CHANGED" });
            persistSelection();
          },

          updateWalletAccount: (connectorId, account) => {
            dispatch({ account, connectorId, type: "ACCOUNT_UPDATED" });
            persistPool();
          },
        };
      },
      { enabled: !isProduction(), name: "butr-wallet" },
    ),
  );
};

export type { WalletStore, WalletStoreState };
export { createWalletStore };
