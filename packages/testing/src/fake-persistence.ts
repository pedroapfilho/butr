import type {
  ChainPlatform,
  ConnectedWallet,
  StoredPoolRecord,
  StoredSelectionRecord,
  WalletPersistence,
} from "@butr/core";

type FakePersistenceSeed = {
  activeConnectorId?: string | null;
  pool?: StoredPoolRecord;
  selection?: StoredSelectionRecord;
  userDisconnected?: boolean;
};

/**
 * In-memory `WalletPersistence` for tests. Mirrors `WalletStorage`'s
 * shape without touching localStorage or cookies. Seed initial state
 * via the optional `seed` argument; reads/writes resolve synchronously
 * (wrapped in `Promise.resolve` to satisfy the async interface).
 */
const createFakePersistence = (seed: FakePersistenceSeed = {}): WalletPersistence => {
  let pool: StoredPoolRecord = seed.pool ?? {};
  let selection: StoredSelectionRecord = seed.selection ?? {};
  let activeConnectorId: string | null = seed.activeConnectorId ?? null;
  let userDisconnected = seed.userDisconnected ?? false;

  return {
    clearAll: () => {
      pool = {};
      selection = {};
      activeConnectorId = null;
      userDisconnected = false;
      return Promise.resolve();
    },
    clearPool: () => {
      pool = {};
      return Promise.resolve();
    },
    getActiveConnectorId: () => Promise.resolve(activeConnectorId),
    getPool: () => Promise.resolve(pool),
    getSelection: () => Promise.resolve(selection),
    isUserDisconnected: () => Promise.resolve(userDisconnected),
    markUserDisconnected: (value) => {
      userDisconnected = value;
      return Promise.resolve();
    },
    removePoolEntry: (connectorId) => {
      const next: StoredPoolRecord = { ...pool };
      delete next[connectorId];
      pool = next;
      return Promise.resolve();
    },
    setActiveConnectorId: (id) => {
      activeConnectorId = id;
      return Promise.resolve();
    },
    setPool: (next: Map<string, ConnectedWallet>) => {
      const record: StoredPoolRecord = {};
      for (const [id, wallet] of next.entries()) {
        record[id] = {
          account: wallet.account,
          accounts: wallet.accounts,
          chainPlatform: wallet.connector.chainPlatform,
          connectorId: wallet.connector.id,
        };
      }
      pool = record;
      return Promise.resolve();
    },
    setSelection: (next: Map<ChainPlatform, string>) => {
      const record: StoredSelectionRecord = {};
      for (const [platform, id] of next.entries()) {
        record[platform] = id;
      }
      selection = record;
      return Promise.resolve();
    },
  };
};

export type { FakePersistenceSeed };
export { createFakePersistence };
