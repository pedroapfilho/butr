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

/**
 * Whether a wallet is currently usable from the user's environment.
 *
 * - `installed` — the wallet is available and `connect()` can be called.
 * - `loadable` — the wallet's SDK can be loaded on demand (e.g. WalletConnect
 *   modal that pops a QR code without requiring a browser extension).
 * - `not-installed` — the wallet isn't reachable. Consumers typically render
 *   a "download" affordance pointing at `meta.url`.
 */
type WalletAvailability = "installed" | "loadable" | "not-installed";

/**
 * Events a connector can emit while connected. butr's runtime subscribes
 * via `Connector.subscribe?` after a successful `connect()` and dispatches
 * the equivalent reducer event:
 *
 * - `accountChanged` → `ACCOUNT_UPDATED` (also covers chain switches —
 *   the new chain lives inside `account.chain`).
 * - `disconnected` → `DISCONNECTED` (wallet has gone away externally:
 *   user locked it, removed the extension, etc.).
 */
type ConnectorEvent = { account: Account; type: "accountChanged" } | { type: "disconnected" };

/**
 * Capability flags describing what an adapter can actually do at
 * runtime. Populated by each adapter (the auto-built ones derive
 * these from the underlying protocol's feature advertisements;
 * hand-rolled adapters declare them explicitly). Consumers branch on
 * these to gate UI affordances:
 *
 * ```tsx
 * {wallet.connector.capabilities.requestAccounts ? (
 *   <button onClick={() => requestAccounts(wallet.connector.id)}>
 *     Request more accounts
 *   </button>
 * ) : null}
 * ```
 *
 * Each flag means "can this work right now," not "is the method
 * defined": `signMessage: false` means calling `signMessage()` would
 * reject; `switchChain: false` means switching is a no-op regardless
 * of which chain is passed.
 */
type WalletCapabilities = {
  /** `getBalance` returns a real on-chain value (vs. a 0n placeholder). */
  getBalance: boolean;
  /** `getTransactionReceipt` returns a real RPC response. */
  getTransactionReceipt: boolean;
  /** Calling `requestAccounts` will actually do something — either
   *  prompt the user (EIP-2255) or refresh the exposed list. */
  requestAccounts: boolean;
  /** `sendTx` / `sendTxToChain` will work. False for SVM wallets that
   *  don't advertise `solana:signAndSendTransaction`. */
  sendTransaction: boolean;
  /** `signMessage` will work. False for SVM wallets that don't
   *  advertise `solana:signMessage`. */
  signMessage: boolean;
  /** Wallet emits account/chain change events that butr can bridge. */
  subscribe: boolean;
  /** `switchAccount` is real. Almost always `false` for auto adapters
   *  — neither protocol exposes silent account switch. Hand-rolled
   *  adapters with custom transports may set it `true`. */
  switchAccount: boolean;
  /** `switchChain` routes subsequent calls through the new chain. EVM:
   *  true via `wallet_switchEthereumChain`. SVM: true (local state +
   *  per-call `chain` input) when more than one chain is advertised. */
  switchChain: boolean;
};

/**
 * Orchestration interface — what `butr` actually calls during the
 * connect / disconnect / hydrate flow. This is the contract `butr`
 * cares about; everything else on `WalletAdapter` is consumer-facing.
 */
type Connector = {
  /** Runtime capability flags — see `WalletCapabilities`. Read these
   *  to gate UI affordances rather than probing for method existence. */
  capabilities: WalletCapabilities;
  chainPlatform: ChainPlatform;
  /** Begin a connection request. Resolves when the wallet is connected,
   *  rejects on user cancellation or other error. */
  connect(): Promise<void>;
  /** Optional teardown. butr calls this on disconnect, error recovery, and reset. */
  disconnect?(): Promise<void>;
  /** Read the currently-active account. butr uses this to populate the pool
   *  after a successful `connect()` and during hydration. */
  getAccount(): Promise<Account | null>;
  /** Optional. List every account the wallet exposes. Some browser wallets
   *  show many accounts at once (MetaMask with multiple imports). If
   *  omitted, butr defaults to `[await getAccount()]`. */
  getAccounts?(): Promise<Array<Account>>;
  /** Optional. Wallet logo as a URL or data URI. Adapters built via butr's
   *  auto-discovery (EIP-6963, Wallet Standard) populate this from the
   *  wallet's announced metadata; hand-rolled adapters can leave it
   *  unset and supply icons separately via `ConnectorMeta`. */
  icon?: string;
  /** Stable key: "metamask", "phantom", etc. Pool entries are keyed by this. */
  id: string;
  /** Human name: "MetaMask", "Phantom", etc. UI-facing only. */
  name: string;
  /** Optional. Ask the wallet to open its account-selection UI so the
   *  user can expose additional accounts to this app. Implemented on
   *  EIP-6963 wallets via `wallet_requestPermissions`; Wallet Standard
   *  wallets generally leave this unset because the user enables more
   *  accounts directly in the extension. Resolution doesn't include the
   *  new accounts — call `getAccounts()` (or use butr's
   *  `useRequestAccounts` hook, which refreshes the pool entry for
   *  you). */
  requestAccounts?(): Promise<void>;
  /** Optional. Subscribe to wallet-side events (account swap, network swap,
   *  external disconnect). butr's runtime calls this after a successful
   *  `connect()`, and uses the returned function to unsubscribe on
   *  disconnect / reset. Bridges native wallet events into the reducer so
   *  consumers don't have to wire `accountsChanged` / `chainChanged`
   *  themselves. */
  subscribe?(listener: (event: ConnectorEvent) => void): () => void;
};

/**
 * Capability interface — what consumers call on a connected wallet
 * (signing, sending, balance lookups). `butr` never invokes these
 * itself; they exist solely to give consumers a typed surface to talk
 * to a connected wallet through.
 */
type Wallet = {
  /** Read a token balance. `mint` is optional; the connector decides
   *  what "no mint" means for its chain (native ETH on EVM, native SOL
   *  on Solana, etc.). */
  getBalance(mint?: string): Promise<Balance>;
  /** Returns a chain-specific signer. Consumers cast to the concrete
   *  type (e.g. WalletClient on viem, AnchorProvider on Solana). */
  getSigner(): Promise<unknown>;
  /** Look up the status of a previously-submitted transaction. */
  getTransactionReceipt(tx: string): Promise<{
    status: "Success" | "Error" | "Pending";
  }>;
  /** Submit a transaction on the wallet's currently-active chain.
   *  Pass an `account` from `ConnectedWallet.accounts` to route the
   *  transaction through a specific exposed address instead of the
   *  wallet's currently-active one. EVM wallets honour this via
   *  `tx.from`; Wallet Standard wallets via the feature's `account`
   *  input. Omit for "use whichever the wallet picks." */
  sendTx(tx: unknown, account?: Account): Promise<string>;
  /** Submit a transaction targeting a specific chain. The optional
   *  callback fires after the connector has switched chain (consumers
   *  use this to re-enable UI). Pass an `account` to route through a
   *  specific exposed address (see `sendTx`). */
  sendTxToChain(
    tx: unknown,
    targetChainId: string,
    account?: Account,
    cb?: () => void,
  ): Promise<string>;
  /**
   * Sign a message and return both the signature and the bytes the wallet
   * actually signed. Solana Wallet Standard wallets may prefix or re-encode
   * the message internally; verifiers must check the signature against
   * `signedMessage`, not the input bytes. EVM wallets echo the input.
   *
   * Pass an `account` to sign with a specific exposed address. EIP-1193
   * routes it through `personal_sign`'s address param; Wallet Standard
   * uses the feature's `account` input. Both support per-call signing
   * without changing the wallet's active account.
   */
  signMessage(
    msg: Uint8Array,
    account?: Account,
  ): Promise<{ signature: Uint8Array; signedMessage: Uint8Array }>;
  /** Switch to a different account on the same wallet (some wallets
   *  expose multiple accounts simultaneously). */
  switchAccount?(address: string): Promise<void>;
  /** Switch the wallet's active chain. */
  switchChain(chain: ChainBase): Promise<void>;
};

/**
 * Full interface every connector implementation must fulfill.
 * Equivalent to `Connector & Wallet`. The split is documentary —
 * it makes the orchestration / capability seam explicit:
 *  - `Connector` is what butr calls.
 *  - `Wallet` is what your app code calls on a connected wallet.
 */
type WalletAdapter = Connector & Wallet;

type ConnectedWallet = {
  /** Currently-active account on this wallet. */
  account: Account;
  /** All accounts known on this wallet at the time of connect/refresh.
   *  Always contains at least `account`. Populated from `getAccounts()`
   *  if the connector implements it; otherwise `[account]`. */
  accounts: Array<Account>;
  connector: WalletAdapter;
};

type ConnectorMeta = {
  /** Optional. Sync probe that reports whether the wallet is currently
   *  available. Defaults to `"installed"` when omitted. Consumers call
   *  this at render time to gate the "Connect" button. */
  availability?: () => WalletAvailability;
  chainPlatform: ChainPlatform;
  /** Optional image URL or data URI for wallet selection UIs. */
  icon?: string;
  id: string;
  name: string;
  /** Optional. Where to send users who don't have this wallet (download
   *  page, app store link, etc.). */
  url?: string;
};

type WalletManagerConfig = {
  /** Available connector metadata */
  connectors: Array<ConnectorMeta>;
  /** Function to instantiate a connector by ID */
  createConnector: (id: string) => WalletAdapter | null;
  /** Called after a wallet is successfully connected */
  onConnect?: (wallet: ConnectedWallet) => void;
  /**
   * Called after a connection attempt fails (user rejected, wallet
   * locked, chain mismatch, timeout, …). Receives the normalised
   * `ConnectionError` plus the id of the connector that was being
   * connected. Useful for piping into observability tooling
   * (Sentry, OTel) without each consumer wiring `try/catch`s around
   * `connectWallet` themselves.
   */
  onConnectError?: (error: import("./errors").ConnectionError, connectorId: string) => void;
  /** Called after a wallet is disconnected */
  onDisconnect?: (chainPlatform: ChainPlatform) => void;
  /** Called after all wallets are reset (e.g., to clear auth tokens) */
  onReset?: () => void | Promise<void>;
  /**
   * Called when a connect attempt takes longer than
   * `slowConnectThresholdMs` (default 5_000) but hasn't yet resolved
   * or rejected. Fires at most once per connect attempt. Useful for
   * surfacing a "still trying — check your wallet" hint in the UI or
   * piping a slow-path metric to telemetry.
   */
  onSlowConnect?: (connectorId: string) => void;
  /** Threshold for `onSlowConnect`, in milliseconds. Defaults to 5_000. */
  slowConnectThresholdMs?: number;
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
  Connector,
  ConnectorEvent,
  ConnectorMeta,
  WalletAdapter,
  Wallet,
  WalletAvailability,
  WalletCapabilities,
  WalletManagerConfig,
};
