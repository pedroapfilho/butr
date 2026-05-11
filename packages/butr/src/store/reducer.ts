import type { Account, ChainPlatform, ConnectedWallet } from "../types";
import type { ConnectionError } from "../types/errors";

type ConnectionStatus = "idle" | "connecting" | "success" | "error";

type State = {
  activeConnectorId: string | null;
  connectingConnectorId: string | null;
  connectionError: ConnectionError | null;
  connectionStatus: ConnectionStatus;
  isHydrated: boolean;
  isUserDisconnected: boolean;
  pool: Map<string, ConnectedWallet>;
  selection: Map<ChainPlatform, string>;
};

type Event =
  | {
      activeConnectorId: string | null;
      isUserDisconnected: boolean;
      pool: Map<string, ConnectedWallet>;
      selection: Map<ChainPlatform, string>;
      type: "HYDRATED";
    }
  | { type: "USER_DISCONNECTED_SET"; value: boolean }
  | { connectorId: string; type: "CONNECT_STARTED" }
  | { connectorId: string; entry: ConnectedWallet; type: "CONNECT_SUCCEEDED" }
  | { error: ConnectionError; type: "CONNECT_FAILED" }
  | { connectorId: string; type: "DISCONNECTED" }
  | { account: Account; connectorId: string; type: "ACCOUNT_UPDATED" }
  | { connectorId: string; type: "WALLET_REFRESHED" }
  | { connectorId: string | null; type: "ACTIVE_CHANGED" }
  | { chainPlatform: ChainPlatform; connectorId: string | null; type: "SELECTION_CHANGED" }
  | { connectorId?: string | null; status: ConnectionStatus; type: "STATUS_SET" }
  | { type: "STATUS_RESET" }
  | { error: ConnectionError | null; type: "ERROR_SET" }
  | { type: "RESET" };

const initialState: State = {
  activeConnectorId: null,
  connectingConnectorId: null,
  connectionError: null,
  connectionStatus: "idle",
  isHydrated: false,
  isUserDisconnected: false,
  pool: new Map(),
  selection: new Map(),
};

/** Find any connector in the pool serving a given platform. */
const findConnectorForPlatform = (
  pool: Map<string, ConnectedWallet>,
  chainPlatform: ChainPlatform,
): string | undefined => {
  for (const [id, wallet] of pool) {
    if (wallet.connector.chainPlatform === chainPlatform) {
      return id;
    }
  }
  return undefined;
};

/** Pure reducer: every state transition is expressed as `(state, event) => state`.
 *  No I/O, no async, no side effects. Side effects live in the runtime. */
const reducer = (state: State, event: Event): State => {
  switch (event.type) {
    case "HYDRATED": {
      return {
        ...state,
        activeConnectorId: event.activeConnectorId,
        isHydrated: true,
        isUserDisconnected: event.isUserDisconnected,
        pool: event.pool,
        selection: event.selection,
      };
    }

    case "USER_DISCONNECTED_SET": {
      return { ...state, isUserDisconnected: event.value };
    }

    case "CONNECT_STARTED": {
      return {
        ...state,
        connectingConnectorId: event.connectorId,
        connectionError: null,
        connectionStatus: "connecting",
      };
    }

    case "CONNECT_SUCCEEDED": {
      const { connectorId, entry } = event;
      const existing = state.pool.get(connectorId);

      // Same connector + same address: only flip the status, keep object refs stable
      // so reactive selectors don't churn.
      if (
        existing &&
        existing.account.walletAddress.toLowerCase() === entry.account.walletAddress.toLowerCase()
      ) {
        return {
          ...state,
          activeConnectorId: connectorId,
          connectingConnectorId: null,
          connectionStatus: "success",
        };
      }

      const newPool = new Map([...state.pool, [connectorId, entry] as const]);
      const newSelection = new Map([
        ...state.selection,
        [entry.connector.chainPlatform, connectorId] as const,
      ]);

      return {
        ...state,
        activeConnectorId: connectorId,
        connectingConnectorId: null,
        connectionStatus: "success",
        pool: newPool,
        selection: newSelection,
      };
    }

    case "CONNECT_FAILED": {
      return {
        ...state,
        connectingConnectorId: null,
        connectionError: event.error,
        connectionStatus: "error",
      };
    }

    case "DISCONNECTED": {
      const wallet = state.pool.get(event.connectorId);
      if (!wallet) {
        return state;
      }

      const newPool = new Map(state.pool);
      newPool.delete(event.connectorId);

      const newSelection = new Map(state.selection);
      const platform = wallet.connector.chainPlatform;
      if (newSelection.get(platform) === event.connectorId) {
        newSelection.delete(platform);
        const fallback = findConnectorForPlatform(newPool, platform);
        if (fallback) {
          newSelection.set(platform, fallback);
        }
      }

      const firstId = newPool.keys().next();
      const activeConnectorId =
        state.activeConnectorId === event.connectorId
          ? (firstId.value ?? null)
          : state.activeConnectorId;

      return {
        ...state,
        activeConnectorId,
        pool: newPool,
        selection: newSelection,
      };
    }

    case "ACCOUNT_UPDATED": {
      const wallet = state.pool.get(event.connectorId);
      if (!wallet) {
        return state;
      }
      // Skip update when the account hasn't actually changed.
      // Prevents unnecessary Map churn that cascades through useSyncExternalStore
      // subscribers, which can trigger React Error #185.
      if (
        wallet.account.walletAddress === event.account.walletAddress &&
        wallet.account.chain.id === event.account.chain.id
      ) {
        return state;
      }
      // Auto-extend the known-accounts list when the new account is one
      // we haven't seen before. Keeps `useAccounts` honest after wallet-side
      // account swaps.
      const seen = wallet.accounts.some(
        (a) =>
          a.walletAddress === event.account.walletAddress && a.chain.id === event.account.chain.id,
      );
      const accounts = seen ? wallet.accounts : [...wallet.accounts, event.account];
      const newPool = new Map([
        ...state.pool,
        [event.connectorId, { ...wallet, account: event.account, accounts }] as const,
      ]);
      return { ...state, pool: newPool };
    }

    case "WALLET_REFRESHED": {
      const wallet = state.pool.get(event.connectorId);
      if (!wallet) {
        return state;
      }
      const newPool = new Map([...state.pool, [event.connectorId, { ...wallet }] as const]);
      return { ...state, pool: newPool };
    }

    case "ACTIVE_CHANGED": {
      return { ...state, activeConnectorId: event.connectorId };
    }

    case "SELECTION_CHANGED": {
      const newSelection = new Map(state.selection);
      if (event.connectorId === null) {
        newSelection.delete(event.chainPlatform);
      } else {
        newSelection.set(event.chainPlatform, event.connectorId);
      }
      return { ...state, selection: newSelection };
    }

    case "STATUS_SET": {
      return {
        ...state,
        connectingConnectorId:
          event.status === "connecting" ? (event.connectorId ?? state.connectingConnectorId) : null,
        connectionStatus: event.status,
      };
    }

    case "STATUS_RESET": {
      return {
        ...state,
        connectingConnectorId: null,
        connectionError: null,
        connectionStatus: "idle",
      };
    }

    case "ERROR_SET": {
      return {
        ...state,
        connectionError: event.error,
        connectionStatus: event.error ? "error" : "idle",
      };
    }

    case "RESET": {
      return {
        ...initialState,
        isHydrated: state.isHydrated,
        isUserDisconnected: true,
      };
    }

    default: {
      // Exhaustiveness check — TS errors if a new event type is added without a case.
      const _exhaustive: never = event;
      void _exhaustive;
      return state;
    }
  }
};

export type { ConnectionStatus, Event, State };
export { initialState, reducer };
