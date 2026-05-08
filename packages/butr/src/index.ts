// Types
export type {
  ChainBase,
  Account,
  Balance,
  ChainPlatform,
  ConnectedWallet,
  ConnectorMeta,
  UIConnector,
  WalletManagerConfig,
} from "./types";

// Store
export type { ConnectionStatus, WalletStore, WalletStoreState } from "./store";
export { createWalletStore } from "./store";

// Storage
export type {
  BrowserStorageDrivers,
  ConnectedWalletsRecord,
  MaybePromise,
  StorageDriver,
  StoredWalletData,
  WalletPersistence,
} from "./storage";
export { createBrowserStorageDriver, createMemoryStorageDriver, WalletStorage } from "./storage";

// React — Provider
export { WalletManagerProvider } from "./context";

// React — Hooks
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
} from "./hooks";
