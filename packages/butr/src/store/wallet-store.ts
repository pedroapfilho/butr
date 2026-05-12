import { createStore } from "zustand/vanilla";
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
import { hydrateFromStorage, restoreOneEntry, run } from "./wallet-store-helpers";
import type { StoredPoolEntry } from "../storage";
import { type Event, type State, initialState, reducer } from "./reducer";

const CONNECT_TIMEOUT_MS = 90_000;
const DEFAULT_SLOW_CONNECT_THRESHOLD_MS = 5_000;

type ExtractState<S> = S extends { getState: () => infer T } ? T : never;

type RuntimeMembers = {
  _config: WalletManagerConfig;
  _hydrateWallets: () => Promise<void>;
  _markUserDisconnected: (value: boolean) => void;
  _storage: WalletPersistence;
  _tryRestoreFromPending: (connectorId: string) => Promise<void>;
  connectWallet: (
    connectorId: string,
    onSuccess?: (wallet: ConnectedWallet) => void,
    onError?: (error: Error) => void,
  ) => Promise<void>;
  disconnectWallet: (connectorId: string) => void;
  getConnectorInstance: (id: string) => ReturnType<WalletManagerConfig["createConnector"]>;
  refreshWallet: (connectorId: string) => void;
  requestAccounts: (connectorId: string) => Promise<void>;
  reset: () => void;
  resetConnectionStatus: () => void;
  setActiveConnector: (connectorId: string | null) => void;
  setConnectionError: (error: ConnectionError | null) => void;
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

  // Storage-error handler. Default: `console.warn` (preserves the
  // pre-`onStorageError` behaviour). Consumer-provided callback routes
  // failures through their telemetry pipeline.
  const reportStorageError = (context: string) => (error: unknown) => {
    if (config.onStorageError) {
      try {
        config.onStorageError(error, context);
      } catch (cbError: unknown) {
        console.warn("[butr] onStorageError threw:", cbError);
      }
      return;
    }
    console.warn(`[butr] ${context}:`, error);
  };

  // Stored pool entries that couldn't be restored at hydration because
  // their adapter wasn't registered yet (auto-discovery race for SVM).
  // `_tryRestoreFromPending(connectorId)` consumes from here when the
  // matching adapter finally announces.
  const pendingRestores = new Map<string, StoredPoolEntry>();

  return createStore<State & RuntimeMembers>()((set, get) => {
        const dispatch = (event: Event) => {
          set((prev) => reducer(prev, event), false);
        };

        // Fire-and-forget storage writes. Each persister is independent
        // — `persistPool` only writes the pool, `persistSelection` only
        // writes the selection, etc. Some events update one slot
        // (`SELECTION_CHANGED` → `persistSelection`), others update all
        // three (`CONNECT_SUCCEEDED`, hydration). When multiple
        // persisters fire from the same call site, they race —
        // intentionally. Each storage key is durable on its own; the
        // order of resolution doesn't affect correctness. Don't
        // collapse these into a single `persistAll()` helper without
        // first reading the call sites — many of them only need one.
        const persistPool = () => {
          void run(() => storage.setPool(get().pool), reportStorageError("failed to persist pool"));
        };

        // Single entry point for "the pool entry's exposed accounts
        // changed." Three call sites use it: the wallet-event bridge
        // (`accountChanged`), the consumer-facing `updateWalletAccount`
        // action, and the `requestAccounts` action. `active` is set when
        // the caller knows which address is now active (wallet event,
        // manual update); omitted when the caller just refreshed the
        // list and wants the reducer's preserve-or-fallback logic.
        const refreshPoolEntry = (
          connectorId: string,
          accounts: Array<Account>,
          active?: Account,
        ) => {
          dispatch({ accounts, active, connectorId, type: "ACCOUNTS_REFRESHED" });
          persistPool();
        };

        const persistSelection = () => {
          void run(
            () => storage.setSelection(get().selection),
            reportStorageError("failed to persist selection"),
          );
        };

        const persistActive = () => {
          void run(
            () => storage.setActiveConnectorId(get().activeConnectorId),
            reportStorageError("failed to persist active connector"),
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
                  // Full-replace the accounts array so the pool entry
                  // mirrors the wallet's current exposure. Drops the
                  // previously-active address on single-account
                  // wallets (Phantom EVM/SVM, MetaMask Snap); preserves
                  // the multi-account list on MetaMask, Rabby, etc.
                  // The wallet tells us which is now active.
                  refreshPoolEntry(connectorId, [...event.accounts], event.account);
                  break;
                }
                case "disconnected": {
                  // Mirror an external disconnect into the reducer.
                  // Don't call connector.disconnect — the wallet already did
                  // the work; just unwire and persist.
                  dispatch({ connectorId, type: "DISCONNECTED" });
                  unsubscribeFromConnector(connectorId);
                  if (get().pool.size === 0) {
                    void run(() => storage.clearAll(), reportStorageError("failed to clear storage"));
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
            // Park entries whose adapter wasn't registered yet — the
            // provider will call `_tryRestoreFromPending` once discovery
            // announces a matching id.
            pendingRestores.clear();
            for (const [connectorId, entry] of result.pending) {
              pendingRestores.set(connectorId, entry);
            }
            // Wire up wallet-side event subscriptions for every restored
            // connector so account/chain swaps after a refresh keep the
            // reducer in sync without consumer effort.
            for (const [connectorId, wallet] of result.pool) {
              subscribeToConnector(connectorId, wallet.connector);
            }
            // Persist any reconciled values back so future loads stay consistent.
            persistSelection();
            persistActive();
            // Drain: catch the race where a Wallet Standard adapter
            // announced BEFORE hydration finished populating
            // pendingRestores. Without this, the discovery callback's
            // `_tryRestoreFromPending(adapter.id)` would have found
            // an empty map and silently returned, leaving SVM wallets
            // un-restored on reload even though their adapter IS in
            // the registry by now. Each call resolves independently;
            // `Promise.all` here mirrors the parallel restore that
            // `hydrateFromStorage` does for the eager path. The promise
            // is dropped on the floor — late-restore failures surface
            // per-entry via `_tryRestoreFromPending`'s own logging.
            const pendingIds = [...pendingRestores.keys()];
            void Promise.all(pendingIds.map((id) => get()._tryRestoreFromPending(id)));
            // Surface the hydration outcome. Three buckets: restored,
            // pending (waiting for adapter announcement), dropped
            // (genuine restore failures). The default `console.warn`
            // for dropped entries is replaced by this callback when
            // set — consumers route to telemetry / UX hints.
            if (config.onHydrated) {
              try {
                config.onHydrated({
                  dropped: result.dropped,
                  pendingIds: [...result.pending.keys()],
                  restoredIds: [...result.pool.keys()],
                });
              } catch (cbError: unknown) {
                console.warn("[butr] onHydrated threw:", cbError);
              }
            } else if (result.dropped.length > 0) {
              // Preserve the pre-`onHydrated` console.warn behaviour
              // when no callback is set, so silent drops still log.
              for (const { connectorId, reason } of result.dropped) {
                console.warn(`[butr] failed to restore connector ${connectorId}:`, reason);
              }
            }
          },
          _tryRestoreFromPending: async (connectorId) => {
            const entry = pendingRestores.get(connectorId);
            if (!entry) {
              return;
            }
            const connector = config.createConnector(connectorId);
            if (!connector) {
              // Adapter still not available — leave the entry pending.
              return;
            }
            // Note: deliberately NOT gating on `isUserDisconnected`.
            // The EVM hydration path (`restoreOneEntry` inside
            // `hydrateFromStorage`) doesn't check that flag either —
            // stored entries restore on reload regardless of whether
            // the user's most recent action was a disconnect. The
            // late-restore path mirrors that policy for symmetry.
            const outcome = await restoreOneEntry(connectorId, entry, connector);
            pendingRestores.delete(connectorId);
            if (outcome.kind === "fail") {
              console.warn(`[butr] late restore failed for ${connectorId}:`, outcome.error);
              void run(
                () => storage.removePoolEntry(connectorId),
                reportStorageError("failed to remove broken entry"),
              );
              return;
            }
            // Reuse the reducer's connect-success path so selection /
            // active reconciliation matches a normal connect flow.
            dispatch({ connectorId, entry: outcome.entry, type: "CONNECT_SUCCEEDED" });
            subscribeToConnector(connectorId, outcome.entry.connector);
            persistPool();
            persistSelection();
            persistActive();
            config.onConnect?.(outcome.entry);
          },
          _markUserDisconnected: (value: boolean) => {
            dispatch({ type: "USER_DISCONNECTED_SET", value });
            void run(
              () => storage.markUserDisconnected(value),
              reportStorageError("failed to persist disconnect intent"),
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

            // Slow-connect telemetry. Fires once if the wallet doesn't
            // resolve within the configured threshold. Cleared in finally.
            const slowThreshold =
              config.slowConnectThresholdMs ?? DEFAULT_SLOW_CONNECT_THRESHOLD_MS;
            const slowTimer = config.onSlowConnect
              ? setTimeout(() => {
                  try {
                    config.onSlowConnect?.(connectorId);
                  } catch (cbError: unknown) {
                    console.warn("[butr] onSlowConnect threw:", cbError);
                  }
                }, slowThreshold)
              : null;

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
              const normalised = mapConnectionError(error);
              dispatch({ error: normalised, type: "CONNECT_FAILED" });
              try {
                await connector.disconnect?.();
              } catch (disconnectError: unknown) {
                console.warn("[butr] disconnect during error recovery failed:", disconnectError);
              }
              try {
                config.onConnectError?.(normalised, connectorId);
              } catch (cbError: unknown) {
                console.warn("[butr] onConnectError threw:", cbError);
              }
              onError?.(error as Error);
              throw error;
            } finally {
              if (slowTimer) {
                clearTimeout(slowTimer);
              }
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
              void run(() => storage.clearAll(), reportStorageError("failed to clear storage"));
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

          requestAccounts: async (connectorId) => {
            const entry = get().pool.get(connectorId);
            if (!entry) {
              return;
            }
            // Ask the wallet to open its picker (if supported). EVM
            // wallets honour this via `wallet_requestPermissions`;
            // Wallet Standard wallets typically have no equivalent
            // RPC, so the call resolves immediately and the refresh
            // below simply re-reads the current list.
            await entry.connector.requestAccounts?.();
            const fresh = entry.connector.getAccounts
              ? await entry.connector.getAccounts().catch(() => null)
              : null;
            if (!fresh || fresh.length === 0) {
              return;
            }
            // No `active` — the reducer preserves the current active
            // if it's still in the refreshed list, else picks [0].
            refreshPoolEntry(connectorId, fresh);
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

            void run(() => storage.clearAll(), reportStorageError("failed to clear storage"));

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

          setSelection: (chainPlatform, connectorId) => {
            dispatch({ chainPlatform, connectorId, type: "SELECTION_CHANGED" });
            persistSelection();
          },

          updateWalletAccount: (connectorId, account) => {
            // Manual variant of the wallet-event path. Builds the
            // next accounts list (dedupe-by-address + chain refresh
            // since chain is wallet-level) and routes through
            // ACCOUNTS_REFRESHED so there's one reducer case for
            // "the wallet's exposure changed."
            const entry = get().pool.get(connectorId);
            if (!entry) {
              return;
            }
            const normalise = (addr: string): string => addr.toLowerCase();
            const newChain = account.chain;
            const remapped = entry.accounts.map((a) =>
              a.chain.id === newChain.id
                ? a
                : {
                    chain: newChain,
                    id: `${newChain.id}:${normalise(a.walletAddress)}`,
                    walletAddress: a.walletAddress,
                  },
            );
            const seen = remapped.some(
              (a) => normalise(a.walletAddress) === normalise(account.walletAddress),
            );
            const accounts = seen ? remapped : [...remapped, account];
            refreshPoolEntry(connectorId, accounts, account);
          },
        };
      });
};

export type { WalletStore, WalletStoreState };
export { createWalletStore };
