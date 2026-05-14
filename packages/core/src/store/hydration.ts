import type {
  Account,
  ChainPlatform,
  ConnectedWallet,
  Connector,
  WalletManagerConfig,
} from "../types";
import type { StoredPoolEntry, WalletPersistence } from "../storage";

/**
 * Restore outcome for a single pool entry. `kind: "ok"` carries the
 * fully-formed `ConnectedWallet`. `kind: "fail"` carries the raw error
 * so the caller can route it to telemetry.
 */
type RestoreOutcome =
  | { connectorId: string; entry: ConnectedWallet; kind: "ok" }
  | { connectorId: string; error: unknown; kind: "fail" };

/**
 * Snapshot returned by `HydrationCoordinator.hydrate()` — everything
 * the reducer needs to compose a `HYDRATED` event plus the metadata the
 * runtime uses to wire subscriptions and surface the outcome.
 */
type HydrateResult = {
  activeConnectorId: string | null;
  /** Entries whose restore actually failed (connect() rejected, the
   *  connector threw mid-flight). The coordinator has already removed
   *  these from storage so a reload won't re-try the same broken entry. */
  dropped: Array<{ connectorId: string; reason: unknown }>;
  isUserDisconnected: boolean;
  /** Entries parked because `createConnector(id)` returned `null` at
   *  hydration time (typical for Wallet Standard adapters announced
   *  asynchronously). The coordinator keeps an internal record of these
   *  and resolves them when the runtime later calls `drainPending`. */
  pendingIds: Array<string>;
  pool: Map<string, ConnectedWallet>;
  selection: Map<ChainPlatform, string>;
};

type HydrationCoordinator = {
  /**
   * Restore a parked entry whose adapter has now become available.
   * Returns `null` if no entry is parked under `connectorId`. Returns an
   * `ok` outcome with the new `ConnectedWallet`, or a `fail` outcome
   * with the error (storage cleanup is handled internally).
   */
  drainPending(connectorId: string): Promise<RestoreOutcome | null>;
  /**
   * Read storage, instantiate every adapter that's currently
   * registered, restore in parallel, park the rest. After the returned
   * promise resolves, the coordinator holds an internal pending queue
   * indexed by `connectorId`. Resolve queued entries via `drainPending`.
   */
  hydrate(): Promise<HydrateResult>;
  /**
   * Snapshot of currently-parked ids. The runtime uses this once
   * immediately after `hydrate()` resolves to drain entries whose
   * adapter announced *during* the hydration window (the discovery race
   * we used to resolve manually inside the store).
   */
  pendingIds(): Array<string>;
};

type StorageErrorReporter = (context: string, error: unknown) => void;

/** Pick the right `accounts` list: fresh from the connector if it
 *  exposes `getAccounts`, otherwise the persisted list, otherwise just
 *  the active account. */
const resolveHydratedAccounts = async (
  connector: Connector,
  storedAccounts: ReadonlyArray<Account>,
  fallbackAccount: Account,
): Promise<Array<Account>> => {
  if (connector.getAccounts) {
    const fresh = await connector.getAccounts().catch(() => null);
    if (fresh && fresh.length > 0) {
      return fresh;
    }
  }
  if (storedAccounts.length > 0) {
    return [...storedAccounts];
  }
  return [fallbackAccount];
};

const restoreOneEntry = async (
  connectorId: string,
  entry: { account: Account; accounts: ReadonlyArray<Account> },
  connector: Connector,
): Promise<RestoreOutcome> => {
  try {
    await connector.connect();
    const freshAccount = await connector.getAccount();
    const accountToUse = freshAccount || entry.account;
    const accounts = await resolveHydratedAccounts(connector, entry.accounts, accountToUse);
    return {
      connectorId,
      entry: {
        account: accountToUse,
        accounts,
        connector: connector as ConnectedWallet["connector"],
      },
      kind: "ok",
    };
  } catch (error) {
    return { connectorId, error, kind: "fail" };
  }
};

const createHydrationCoordinator = (
  storage: WalletPersistence,
  createConnector: WalletManagerConfig["createConnector"],
  reportStorageError: StorageErrorReporter,
): HydrationCoordinator => {
  // Private to the coordinator — the runtime never touches the queue
  // directly. Storing the raw `StoredPoolEntry` is enough; the entry
  // gets re-restored through the same `restoreOneEntry` path used by
  // the eager pass, so the two code paths can't drift.
  const pending = new Map<string, StoredPoolEntry>();

  const removeBrokenEntry = (connectorId: string) => {
    storage.removePoolEntry(connectorId).catch((error: unknown) => {
      reportStorageError("failed to remove broken entry", error);
    });
  };

  return {
    drainPending: async (connectorId) => {
      const entry = pending.get(connectorId);
      if (!entry) {
        return null;
      }
      const connector = createConnector(connectorId);
      if (!connector) {
        // Adapter still not available — leave the entry parked.
        return null;
      }
      const outcome = await restoreOneEntry(connectorId, entry, connector);
      pending.delete(connectorId);
      if (outcome.kind === "fail") {
        removeBrokenEntry(connectorId);
      }
      return outcome;
    },

    hydrate: async () => {
      const [storedPool, storedSelection, storedActive, userDisconnected] = await Promise.all([
        storage.getPool(),
        storage.getSelection(),
        storage.getActiveConnectorId(),
        storage.isUserDisconnected(),
      ]);

      // TODO remove diagnostic
      console.log("[butr/hydrate] storedPool keys", Object.keys(storedPool));

      const pool = new Map<string, ConnectedWallet>();
      const dropped: Array<{ connectorId: string; reason: unknown }> = [];

      // Clear pending from any prior hydrate() in the same coordinator
      // instance (e.g. tests that rehydrate). The runtime only calls
      // hydrate() once per provider mount, but defending against the
      // multi-call case is cheap.
      pending.clear();

      // Build the restore-task list eagerly. A null factory result
      // parks the entry; an instantiated connector enters the parallel
      // restore pool.
      const tasks: Array<Promise<RestoreOutcome>> = [];
      for (const [connectorId, entry] of Object.entries(storedPool)) {
        if (!entry) {
          continue;
        }
        const connector = createConnector(connectorId);
        // TODO remove diagnostic
        console.log("[butr/hydrate] entry", { connectorId, hasConnector: Boolean(connector) });
        if (!connector) {
          pending.set(connectorId, entry);
          continue;
        }
        tasks.push(restoreOneEntry(connectorId, entry, connector));
      }

      const outcomes = await Promise.all(tasks);
      // TODO remove diagnostic
      console.log("[butr/hydrate] outcomes", outcomes.map((o) => ({ id: o.connectorId, kind: o.kind })));
      for (const outcome of outcomes) {
        if (outcome.kind === "ok") {
          pool.set(outcome.connectorId, outcome.entry);
          continue;
        }
        dropped.push({ connectorId: outcome.connectorId, reason: outcome.error });
        removeBrokenEntry(outcome.connectorId);
      }

      // Reconcile selection: drop stale entries, fill platforms with
      // a pool member but no stored selection.
      const selection = new Map<ChainPlatform, string>();
      for (const [platform, connectorId] of Object.entries(storedSelection)) {
        if (connectorId && pool.has(connectorId)) {
          selection.set(platform as ChainPlatform, connectorId);
        }
      }
      for (const [connectorId, wallet] of pool) {
        const platform = wallet.connector.chainPlatform;
        if (!selection.has(platform)) {
          selection.set(platform, connectorId);
        }
      }

      let activeConnectorId: string | null = null;
      if (storedActive && pool.has(storedActive)) {
        activeConnectorId = storedActive;
      } else if (pool.size > 0) {
        activeConnectorId = pool.keys().next().value ?? null;
      }

      return {
        activeConnectorId,
        dropped,
        isUserDisconnected: userDisconnected,
        pendingIds: [...pending.keys()],
        pool,
        selection,
      };
    },

    pendingIds: () => [...pending.keys()],
  };
};

export type { HydrateResult, HydrationCoordinator, RestoreOutcome, StorageErrorReporter };
export { createHydrationCoordinator };
