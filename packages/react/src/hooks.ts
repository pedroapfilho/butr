import { useMemo } from "react";
import { useStore } from "zustand";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { Account, ChainPlatform, ConnectedWallet, WalletStoreState } from "@butr/core";
import { walletEqual } from "@butr/core";
import { useWalletStoreContext } from "./context";

const EMPTY_ACCOUNTS: ReadonlyArray<Account> = [];

const accountsEqual = (a: ReadonlyArray<Account>, b: ReadonlyArray<Account>) => {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (!x || !y) {
      return false;
    }
    if (x.walletAddress !== y.walletAddress || x.chain.id !== y.chain.id) {
      return false;
    }
  }
  return true;
};

// ============================================================================
// CONNECTION STATE HOOKS
// ============================================================================

/** Connection status: "idle" | "connecting" | "success" | "error". */
const useConnectionStatus = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.connectionStatus);
};

/** True iff `connectionStatus === "connecting"`. */
const useIsConnecting = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.connectionStatus === "connecting");
};

/** ID of the wallet currently in the connecting flight (null when idle). */
const useConnectingConnectorId = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.connectingConnectorId);
};

/** ID of the wallet currently focused as the global active selection. */
const useActiveConnectorId = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.activeConnectorId);
};

/** Last connection error message, if any. */
const useConnectionError = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.connectionError);
};

/** True if at least one wallet is connected. */
const useWalletConnected = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.pool.size > 0);
};

/** Has the store finished its initial hydration pass? */
const useIsHydrated = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.isHydrated);
};

/** Session-scoped disconnect-intent flag. True after an explicit disconnect or
 *  reset, false after a fresh session or a new connection. Consumers use this
 *  to suppress auto-reconnect immediately after a manual disconnect. */
const useIsUserDisconnected = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.isUserDisconnected);
};

// ============================================================================
// POOL / SELECTION / ACTIVE
// ============================================================================

/** Full pool of connected wallets, keyed by `connectorId`. Re-renders on any pool change. */
const usePool = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.pool);
};

/** Pool projected as an array. Stable when the pool reference is stable. */
const useConnectedWallets = (): Array<ConnectedWallet> => {
  const pool = usePool();
  return useMemo(() => [...pool.values()], [pool]);
};

/** Per-platform selection: `Map<ChainPlatform, connectorId>`. */
const useSelection = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.selection);
};

/** Globally active wallet (the one in front of the user right now). */
const useActiveWallet = (): ConnectedWallet | undefined => {
  const store = useWalletStoreContext();
  return useStoreWithEqualityFn(
    store,
    (state) => (state.activeConnectorId ? state.pool.get(state.activeConnectorId) : undefined),
    walletEqual,
  );
};

/** Reactive lookup of the wallet selected for a given platform. */
const useSelectedWallet = (chainPlatform: ChainPlatform | null): ConnectedWallet | undefined => {
  const store = useWalletStoreContext();
  return useStoreWithEqualityFn(
    store,
    (state) => {
      if (!chainPlatform) {
        return undefined;
      }
      const id = state.selection.get(chainPlatform);
      return id ? state.pool.get(id) : undefined;
    },
    walletEqual,
  );
};

/** Reactive boolean: is there a selected wallet for a given platform? */
const useIsPlatformConnected = (chainPlatform: ChainPlatform): boolean => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.selection.has(chainPlatform));
};

/**
 * All known accounts on a wallet. Defaults to the active wallet when
 * `connectorId` is omitted. Re-renders only when the accounts list
 * actually changes (by address + chain id), so wallet-side
 * `accountChanged` events bridged via `Connector.subscribe` flow through
 * cleanly.
 */
const useAccounts = (connectorId?: string | null): ReadonlyArray<Account> => {
  const store = useWalletStoreContext();
  return useStoreWithEqualityFn(
    store,
    (state) => {
      const id = connectorId ?? state.activeConnectorId;
      const wallet = id ? state.pool.get(id) : undefined;
      return wallet ? wallet.accounts : EMPTY_ACCOUNTS;
    },
    accountsEqual,
  );
};

// ============================================================================
// STABLE ACCESSORS (return functions; safe to use in callbacks)
// ============================================================================

/** Stable accessor: `(connectorId) => ConnectedWallet | undefined`. */
const useGetWallet = () => {
  const store = useWalletStoreContext();
  return (connectorId: string) => store.getState().pool.get(connectorId);
};

/** Stable accessor: `(platform) => ConnectedWallet | undefined`. */
const useGetSelectedWallet = () => {
  const store = useWalletStoreContext();
  return (chainPlatform: ChainPlatform) => {
    const state = store.getState();
    const id = state.selection.get(chainPlatform);
    return id ? state.pool.get(id) : undefined;
  };
};

/** Stable accessor for raw connector instances. */
const useGetConnectorInstance = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.getConnectorInstance);
};

// ============================================================================
// MUTATION HOOKS
// ============================================================================

const useConnectWallet = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.connectWallet);
};

const useDisconnectWallet = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.disconnectWallet);
};

const useSetActiveConnector = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.setActiveConnector);
};

const useSetSelection = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.setSelection);
};

const useResetWallet = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.reset);
};

const useUpdateWalletAccount = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.updateWalletAccount);
};

const useRefreshWallet = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.refreshWallet);
};

/**
 * Open the wallet's account-selection UI (if the connector supports it),
 * then re-read `getAccounts()` and update the pool entry's `accounts`
 * array. EVM wallets call `wallet_requestPermissions` under the hood;
 * Wallet Standard wallets that don't expose a picker just refresh.
 *
 * Consumers should hide the trigger when
 * `wallet.connector.requestAccounts` is undefined — the action still
 * resolves cleanly, but no picker will open.
 */
const useRequestAccounts = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.requestAccounts);
};

/** Clear `connectionError` + reset `connectionStatus` to idle. Useful when
 *  surfacing an error in UI and giving the user a "dismiss" affordance. */
const useResetConnectionStatus = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.resetConnectionStatus);
};

const useSetConnectionError = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.setConnectionError);
};

// ============================================================================
// DIRECT STORE ACCESS
// ============================================================================

/**
 * Direct access to the Zustand store for custom selectors. Uses shallow
 * equality on the selector result, so returning an inline object or array
 * is safe — no infinite re-render loop. Primitive selectors are
 * unaffected (shallow falls back to `Object.is`).
 *
 * @example
 * const { pool, activeConnectorId } = useWalletStore((state) => ({
 *   pool: state.pool,
 *   activeConnectorId: state.activeConnectorId,
 * }));
 */
const useWalletStore = <T>(selector: (state: WalletStoreState) => T) => {
  const store = useWalletStoreContext();
  return useStoreWithEqualityFn(store, selector, shallow);
};

export {
  useAccounts,
  useActiveConnectorId,
  useActiveWallet,
  useConnectedWallets,
  useConnectingConnectorId,
  useConnectionError,
  useConnectionStatus,
  useConnectWallet,
  useDisconnectWallet,
  useGetConnectorInstance,
  useGetSelectedWallet,
  useGetWallet,
  useIsConnecting,
  useIsHydrated,
  useIsPlatformConnected,
  useIsUserDisconnected,
  usePool,
  useRefreshWallet,
  useRequestAccounts,
  useResetConnectionStatus,
  useResetWallet,
  useSelectedWallet,
  useSelection,
  useSetActiveConnector,
  useSetConnectionError,
  useSetSelection,
  useUpdateWalletAccount,
  useWalletConnected,
  useWalletStore,
};
