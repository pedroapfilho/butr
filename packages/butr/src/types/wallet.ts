import type { WalletPersistence } from "../storage/persistence";
import type { ChainBase } from "./chain";

type ChainPlatform = "evm" | "svm" | "move" | "unified";

type WalletMode = "smart-wallet" | "external-wallet" | "none";

type Account = {
  chain: ChainBase;
  id: string;
  walletAddress: string;
};

type SignInInput = {
  chainId?: string;
  domain: string;
  issuedAt?: string;
  nonce?: string;
  statement?: string;
  uri?: string;
  version?: string;
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
  /** OIDC provider: "google", "apple", "github", etc. */
  authProvider?: string;
  chainPlatform: ChainPlatform;
  // Lifecycle
  connect(): Promise<void>;

  disconnect?(): Promise<void>;
  // Capabilities
  getAccount(): Promise<Account | null>;
  /** For unified connectors: get the account for a specific platform */
  getAccountForPlatform?(platform: ChainPlatform): Account | null;
  getBalance(mint?: string): Promise<Balance>;
  /** Returns a chain-specific signer. Consumers cast to the concrete type (e.g. WalletClient). */
  getSigner(): Promise<unknown>;
  getTransactionReceipt(tx: string): Promise<{
    status: "Success" | "Error" | "Pending";
  }>;

  /** Stable key: "metamask", "phantom", "embedded-evm", etc. */
  id: string;
  /** True for embedded wallets */
  isEmbedded?: boolean;

  /** True if wallet uses OIDC for authentication (OAuth providers) */
  isOIDCBased?: boolean;
  /** True for smart contract wallets (account abstraction) */
  isSmartWallet?: boolean;
  /** Human name: "MetaMask", "Phantom", "Google", etc. */
  name: string;
  /** True if authentication is required before connection */
  requiresAuth?: boolean;
  sendTx(tx: unknown): Promise<string>;
  sendTxToChain(tx: unknown, targetChainId: string, cb?: () => void): Promise<string>;
  /** For unified connectors: set which platform is currently active */
  setActiveChainPlatform?(platform: ChainPlatform): void;
  /**
   * Optional Sign-In With Solana / Ethereum flow. Implemented when the
   * connected wallet supports the chain's sign-in feature (e.g. Wallet
   * Standard `solana:signIn`). Returns the same shape as `signMessage` —
   * `signedMessage` is the bytes the wallet rendered and signed.
   */
  signIn?(input: SignInInput): Promise<{ signature: Uint8Array; signedMessage: Uint8Array }>;
  /**
   * Sign a message and return both the signature and the bytes the wallet
   * actually signed. Solana Wallet Standard wallets may prefix or re-encode
   * the message internally; verifiers must check the signature against
   * `signedMessage`, not the input bytes. EVM wallets echo the input.
   */
  signMessage(msg: Uint8Array): Promise<{ signature: Uint8Array; signedMessage: Uint8Array }>;
  /** Can be used as owner for smart wallets */
  supportsSmartWallets?: boolean;

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
  SignInInput,
  UIConnector,
  WalletManagerConfig,
  WalletMode,
};
