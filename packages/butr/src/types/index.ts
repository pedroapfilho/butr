export type { ChainBase } from "./chain";
export type { ConnectionError, ConnectionErrorKind } from "./errors";
export { mapConnectionError } from "./errors";

export type {
  Account,
  Balance,
  ChainPlatform,
  ConnectedWallet,
  Connector,
  ConnectorEvent,
  ConnectorMeta,
  WalletAdapter,
  Wallet,
  WalletAvailability,
  WalletManagerConfig,
} from "./wallet";
