import type { WalletPersistence } from "../storage/persistence";
import type { ChainBase } from "./chain";

type ChainPlatform = "evm" | "svm";

type Account = {
  chain: ChainBase;
  id: string;
  walletAddress: string;
};

type Balance = {
  /** Token decimals (e.g. 9 for SOL, 18 for ETH) */
  decimals: number;
  /** Human-readable string, trimmed of trailing zeros */
  formatted: string;
  /** Token symbol (e.g. "SOL", "ETH") */
  symbol: string;
  /** Raw integer amount */
  value: bigint;
};

/** Unified connector interface that any wallet implementation must fulfill. */
type UIConnector = {
  chainPlatform: ChainPlatform;
  // Lifecycle
  connect(): Promise<void>;

  disconnect?(): Promise<void>;
  // Capabilities
  getAccount(): Promise<Account | null>;
  getBalance(mint?: string): Promise<Balance>;
  /** Returns a chain-specific signer. Consumers cast to the concrete type (e.g. WalletClient). */
  getSigner(): Promise<unknown>;
  getTransactionReceipt(tx: string): Promise<{
    status: "Success" | "Error" | "Pending";
  }>;

  /** Stable key: "metamask", "phantom", etc. */
  id: string;
  /** Human name: "MetaMask", "Phantom", etc. */
  name: string;
  sendTx(tx: unknown): Promise<string>;
  sendTxToChain(tx: unknown, targetChainId: string, cb?: () => void): Promise<string>;
  /**
   * Sign a message and return both the signature and the bytes the wallet
   * actually signed. Solana Wallet Standard wallets may prefix or re-encode
   * the message internally; verifiers must check the signature against
   * `signedMessage`, not the input bytes. EVM wallets echo the input.
   */
  signMessage(msg: Uint8Array): Promise<{ signature: Uint8Array; signedMessage: Uint8Array }>;

  switchAccount?(address: string): Promise<void>;
  switchChain(chain: ChainBase): Promise<void>;
};

type ConnectedWallet = {
  account: Account;
  connector: UIConnector;
};

type ConnectorMeta = {
  chainPlatform: ChainPlatform;
  id: string;
  name: string;
};

type WalletManagerConfig = {
  /** Available connector metadata */
  connectors: Array<ConnectorMeta>;
  /** Function to instantiate a connector by ID */
  createConnector: (id: string) => UIConnector | null;
  /** Called after a wallet is successfully connected */
  onConnect?: (wallet: ConnectedWallet) => void;
  /** Called after a wallet is disconnected */
  onDisconnect?: (chainPlatform: ChainPlatform) => void;
  /** Called after all wallets are reset (e.g., to clear auth tokens) */
  onReset?: () => void | Promise<void>;
  /** Optional custom persistence implementation (e.g., cookie-backed) */
  storage?: WalletPersistence;
  /** Storage key prefix for localStorage */
  storageKeyPrefix?: string;
};

export type {
  Account,
  Balance,
  ChainPlatform,
  ConnectedWallet,
  ConnectorMeta,
  UIConnector,
  WalletManagerConfig,
};
