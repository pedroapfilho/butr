import type {
  Account,
  ChainPlatform,
  ConnectedWallet,
  Connector,
  WalletManagerConfig,
} from "../types";
import type { StoredPoolEntry, WalletPersistence } from "../storage";

/**
 * Pick the right `accounts` list for a hydrated wallet entry: prefer fresh
 * data from `connector.getAccounts()`, otherwise fall back to whatever was
 * persisted, otherwise just the active account. Extracted so the hydration
 * loop can stay readable (and to avoid nested ternaries).
 */
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

type HydrateResult = {
  activeConnectorId: string | null;
  isUserDisconnected: boolean;
  /** Entries we couldn't restore at hydration time because
   *  `createConnector(id)` returned `null`. These are NOT failures —
   *  they're deferred. The most common cause is auto-discovery
   *  timing: Wallet Standard's `@wallet-standard/app` import is async,
   *  so SVM adapters announce themselves AFTER hydration runs at
   *  provider mount. The runtime retains these entries so a later
   *  discovery announcement can trigger a single-entry restore. */
  pending: Map<string, StoredPoolEntry>;
  pool: Map<string, ConnectedWallet>;
  selection: Map<ChainPlatform, string>;
};

const logStorageError = (context: string) => (error: unknown) => {
  console.warn(`[butr] ${context}:`, error);
};

/** Run an async operation fire-and-forget, calling onError if it throws. */
const run = async (fn: () => Promise<void>, onError: (e: unknown) => void): Promise<void> => {
  try {
    await fn();
  } catch (error) {
    onError(error);
  }
};

type RestoreOutcome =
  | { connectorId: string; entry: ConnectedWallet; kind: "ok" }
  | { connectorId: string; error: unknown; kind: "fail" };

/** Restore a single wallet from a stored pool entry. Self-contained so
 *  the hydration loop can run every entry concurrently — each call's
 *  only side effect is the local `pool.set()` the outer function does
 *  after the promise resolves. */
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

/** Restores persisted wallets (pool + selection + active) from storage.
 *  Drops entries whose connector cannot be re-instantiated or fails to connect. */
const hydrateFromStorage = async (
  storage: WalletPersistence,
  createConnector: WalletManagerConfig["createConnector"],
): Promise<HydrateResult> => {
  const [storedPool, storedSelection, storedActive, userDisconnected] = await Promise.all([
    storage.getPool(),
    storage.getSelection(),
    storage.getActiveConnectorId(),
    storage.isUserDisconnected(),
  ]);

  const pool = new Map<string, ConnectedWallet>();
  // Entries whose adapter wasn't registered yet (auto-discovery race).
  // The runtime retries these when discovery announces a matching id.
  const pending = new Map<string, StoredPoolEntry>();

  // Build the restore-task list, instantiating connectors up front. A
  // null factory result isn't a failure — it means the adapter for that
  // id isn't registered at this instant (common during auto-discovery's
  // async warmup). We park the entry on `pending` and let the runtime
  // retry on the next discovery announcement.
  const tasks: Array<Promise<RestoreOutcome>> = [];
  for (const [connectorId, entry] of Object.entries(storedPool)) {
    if (!entry) {
      continue;
    }
    const connector = createConnector(connectorId);
    if (!connector) {
      pending.set(connectorId, entry);
      continue;
    }
    tasks.push(restoreOneEntry(connectorId, entry, connector));
  }

  // Restore every wallet in parallel. Each entry is independent — the
  // only shared state is `pool`, which is a local Map mutated after
  // each task resolves. Failures don't poison neighbours (we ran with
  // Promise.allSettled-style semantics via the typed RestoreOutcome).
  const outcomes = await Promise.all(tasks);
  for (const outcome of outcomes) {
    if (outcome.kind === "ok") {
      pool.set(outcome.connectorId, outcome.entry);
      continue;
    }
    console.warn(`[butr] failed to restore connector ${outcome.connectorId}:`, outcome.error);
    // Best-effort cleanup; persistence errors here aren't fatal.
    void run(
      () => storage.removePoolEntry(outcome.connectorId),
      logStorageError("failed to remove broken entry"),
    );
  }

  // Reconcile selection: drop stale entries.
  const selection = new Map<ChainPlatform, string>();
  for (const [platform, connectorId] of Object.entries(storedSelection)) {
    if (connectorId && pool.has(connectorId)) {
      selection.set(platform as ChainPlatform, connectorId);
    }
  }
  // For platforms with a wallet in the pool but no stored selection, pick any.
  for (const [connectorId, wallet] of pool) {
    const platform = wallet.connector.chainPlatform;
    if (!selection.has(platform)) {
      selection.set(platform, connectorId);
    }
  }

  // Reconcile active connector: must point to a wallet in the pool, otherwise pick any.
  let activeConnectorId: string | null = null;
  if (storedActive && pool.has(storedActive)) {
    activeConnectorId = storedActive;
  } else if (pool.size > 0) {
    activeConnectorId = pool.keys().next().value ?? null;
  }

  return {
    activeConnectorId,
    isUserDisconnected: userDisconnected,
    pending,
    pool,
    selection,
  };
};

export { hydrateFromStorage, logStorageError, restoreOneEntry, run };
export type { RestoreOutcome };
// `hydrateFromStorage` is consumed by the runtime in wallet-store.ts.
// `isProduction`, `logStorageError`, `run` are internal infra utilities
// shared between hydrate + runtime; they're not in butr's public API
// (`src/index.ts` doesn't re-export them).
