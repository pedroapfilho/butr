// Types
export type {
  ChainBase,
  Account,
  Balance,
  ChainPlatform,
  ConnectedWallet,
  ConnectionError,
  ConnectionErrorKind,
  Connector,
  ConnectorEvent,
  ConnectorMeta,
  WalletAdapter,
  Wallet,
  WalletAvailability,
  WalletCapabilities,
  WalletManagerConfig,
} from "./types";
export { mapConnectionError } from "./types";

// Common chains registry (convenience for chain-switcher UIs)
export { CHAINS, CHAINS_BY_PLATFORM, EVM_CHAINS, SVM_CHAINS } from "./chains";

// Store
export type { ConnectionStatus, WalletStore, WalletStoreState } from "./store";
export { createWalletStore } from "./store";

// Storage
export type {
  BrowserStorageDrivers,
  CookieDriverOptions,
  MaybePromise,
  StorageDriver,
  StoredPoolEntry,
  StoredPoolRecord,
  StoredSelectionRecord,
  WalletPersistence,
} from "./storage";
export {
  createBrowserStorageDriver,
  createCookieStorageDriver,
  createMemoryStorageDriver,
  WalletStorage,
} from "./storage";

// React — Provider + auto-discovery hook
export type { AutoProviderProps, ManualProviderProps, WalletManagerProviderProps } from "./context";
export { WalletManagerProvider, useDiscoveredWallets } from "./context";

// React — Hooks
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
} from "./hooks";

// React — Async hooks (signer cache + balance lifecycle)
export type { AsyncState, UseBalanceResult } from "./hooks-async";
export { useBalance, useSigner, useWalletEntry } from "./hooks-async";
