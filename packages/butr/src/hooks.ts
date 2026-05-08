import { useStore } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { useWalletStoreContext } from "./context";
import type { WalletStoreState } from "./store";
import type { ChainPlatform } from "./types";

// ============================================================================
// STATE HOOKS
// ============================================================================

/** Get wallet connection status. Only re-renders when connection state changes. */
const useWalletConnected = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.connected);
};

/** Get if any wallet is connected. Only re-renders when this value changes. */
const useHasAnyWallet = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.hasAnyWallet);
};

/** Session-scoped disconnect-intent flag. True after an explicit disconnect or
 *  reset, false after a fresh session or a new connection. Consumers use this
 *  to suppress auto-reconnect immediately after a manual disconnect. */
const useIsUserDisconnected = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.isUserDisconnected);
};

/** Get connected wallets as array. Only re-renders when wallets change. */
const useConnectedWallets = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.wallets);
};

/** Get connected wallets as map. Only re-renders when wallets change. */
const useConnectedWalletsMap = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.connectedWallets);
};

// ============================================================================
// ACTION HOOKS - Stable references
// ============================================================================

/** Connect a wallet */
const useConnectWallet = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.connectWallet);
};

/** Disconnect a wallet */
const useDisconnectWallet = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.disconnectWallet);
};

/** Reset wallet system */
const useResetWallet = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.reset);
};

/** Update wallet account */
const useUpdateWalletAccount = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.updateWalletAccount);
};

/** Force a wallet entry refresh without changing its account */
const useRefreshWallet = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.refreshWallet);
};

// ============================================================================
// QUERY HOOKS - Stable references
// ============================================================================

/** Get wallet by platform */
const useGetWalletByPlatform = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.getWalletByPlatform);
};

/** Convenience alias for platform-based lookups */
const useGetWalletByChain = () => {
  const getWalletByPlatform = useGetWalletByPlatform();
  return (chainPlatform: ChainPlatform) => getWalletByPlatform(chainPlatform);
};

/** Get wallet for operation */
const useGetWalletForOperation = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.getWalletForOperation);
};

/** Reactive wallet lookup — re-renders when the wallet for the given platform changes. */
const useWalletForOperation = (chainPlatform: ChainPlatform | null) => {
  const store = useWalletStoreContext();
  return useStoreWithEqualityFn(
    store,
    (state) => {
      if (!chainPlatform) {
        return undefined;
      }
      return state.getWalletForOperation(chainPlatform);
    },
    (a, b) => {
      if (a === b) {
        return true;
      }
      if (!a || !b) {
        return false;
      }
      return (
        a.connector.id === b.connector.id &&
        a.account.walletAddress === b.account.walletAddress &&
        a.account.chain.id === b.account.chain.id
      );
    },
  );
};

/** Check if wallet is connected */
const useIsWalletConnected = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.isWalletConnected);
};

/** Get connector instance */
const useGetConnectorInstance = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.getConnectorInstance);
};

// ============================================================================
// CONNECTION STATUS HOOKS
// ============================================================================

/** Get current connection status: "idle" | "connecting" | "success" | "error" */
const useConnectionStatus = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.connectionStatus);
};

/** Check if any wallet connection is in progress */
const useIsConnecting = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.connectionStatus === "connecting");
};

/** Get the ID of the connector currently being connected */
const useActiveConnectorId = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.activeConnectorId);
};

/** Get the current connection error message */
const useConnectionError = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.connectionError);
};

/** Set connection status */
const useSetConnectionStatus = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.setConnectionStatus);
};

/** Reset connection status to idle */
const useResetConnectionStatus = () => {
  const store = useWalletStoreContext();
  return useStore(store, (state) => state.resetConnectionStatus);
};

/**
 * Direct access to the Zustand store for custom selectors.
 *
 * For shallow equality comparison of multiple values, use useShallow:
 * @example
 * import { useShallow } from 'zustand/react/shallow';
 * const { wallets, connected } = useWalletStore(
 *   useShallow((state) => ({ wallets: state.wallets, connected: state.connected }))
 * );
 */
const useWalletStore = <T>(selector: (state: WalletStoreState) => T) => {
  const store = useWalletStoreContext();
  return useStore(store, selector);
};

export {
  useActiveConnectorId,
  useConnectedWallets,
  useConnectedWalletsMap,
  useConnectionError,
  useConnectionStatus,
  useConnectWallet,
  useDisconnectWallet,
  useGetConnectorInstance,
  useGetWalletByChain,
  useGetWalletByPlatform,
  useGetWalletForOperation,
  useHasAnyWallet,
  useIsConnecting,
  useIsUserDisconnected,
  useIsWalletConnected,
  useRefreshWallet,
  useResetConnectionStatus,
  useResetWallet,
  useSetConnectionStatus,
  useUpdateWalletAccount,
  useWalletConnected,
  useWalletForOperation,
  useWalletStore,
};
