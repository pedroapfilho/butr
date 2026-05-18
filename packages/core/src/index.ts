// Types
export type {
  Account,
  Balance,
  ChainBase,
  ChainPlatform,
  ConnectedWallet,
  ConnectionError,
  ConnectionErrorKind,
  Connector,
  ConnectorEvent,
  ConnectorMeta,
  HydrationOutcome,
  Wallet,
  WalletAdapter,
  WalletAvailability,
  WalletCapabilities,
  WalletManagerConfig,
} from "./types";
export { mapConnectionError } from "./types";

// Discovery seam
export type { WalletSource } from "./wallet-source";
export { createWalletSource } from "./wallet-source";

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

// Equality helper used by async hooks in @butr/react
export { walletEqual } from "./wallet-equal";
