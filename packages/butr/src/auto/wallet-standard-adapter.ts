import type { Account, ChainBase, ConnectorEvent, WalletAdapter } from "../types";
import type {
  SolanaSignAndSendTransactionFeature,
  SolanaSignMessageFeature,
  StandardConnectFeature,
  StandardDisconnectFeature,
  StandardEventsFeature,
  WalletStandardWallet,
  WalletStandardWalletAccount,
} from "./wallet-standard-types";

const SOLANA_PREFIX = "solana:";
const SOLANA_DECIMALS = 9;

/** Cross-platform Uint8Array → base64. `Buffer` would be Node-only and
 *  breaks the package in browsers without a polyfill. `btoa` is
 *  available everywhere butr runs (browsers, RN since Hermes, Node 16+,
 *  Bun, Deno). */
const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary);
};

const slugify = (name: string): string =>
  `wallet-standard:${name
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")}`;

const getFeature = <T>(wallet: WalletStandardWallet, name: string): T | undefined => {
  const feature = wallet.features[name];
  return feature ? (feature as T) : undefined;
};

const pickSolanaChain = (wallet: WalletStandardWallet): string | null => {
  // Prefer mainnet-beta, then the first solana chain advertised.
  const mainnet = wallet.chains.find((c) => c === "solana:mainnet" || c === "solana:mainnet-beta");
  if (mainnet) {
    return mainnet;
  }
  return wallet.chains.find((c) => c.startsWith(SOLANA_PREFIX)) ?? null;
};

const buildSolanaChain = (chainId: string, walletName: string): ChainBase => ({
  id: chainId,
  // Same stance as the EIP-6963 side: we don't ship a chain-id → name
  // table. Consumers overlay via structural typing.
  name: walletName,
  namespace: "solana",
  reference: chainId.slice(SOLANA_PREFIX.length),
});

const buildSolanaAccount = (address: string, chain: ChainBase): Account => ({
  chain,
  id: `${chain.id}:${address}`,
  walletAddress: address,
});

const pickFirstAddress = (accounts: ReadonlyArray<WalletStandardWalletAccount>): string | null => {
  const first = accounts[0];
  return first ? first.address : null;
};

const pickAccountByAddress = (
  accounts: ReadonlyArray<WalletStandardWalletAccount>,
  address: string,
): WalletStandardWalletAccount | undefined =>
  accounts.find((a) => a.address === address) ?? accounts[0];

/**
 * Adapt a Solana Wallet Standard `Wallet` object into a butr
 * `WalletAdapter`. Returns `null` if the wallet doesn't advertise any
 * Solana chain or doesn't expose `standard:connect` — both required
 * for butr to do anything useful with it.
 *
 * **Capability gating**
 *
 *  - `signMessage` is only present if the wallet advertises
 *    `solana:signMessage`. Without it, calling `adapter.signMessage`
 *    rejects with a clear error.
 *  - `sendTx` / `sendTxToChain` use `solana:signAndSendTransaction`.
 *    Without it, those methods reject.
 *  - `subscribe` is wired through `standard:events`. Wallets that
 *    don't expose events get a no-op unsubscribe.
 *
 * **Known limitations**
 *
 *  - `getBalance` returns `{ value: 0n, formatted: "0", … }`. Solana
 *    balance reads require an RPC connection that's outside butr's
 *    scope; consumers wrap their own RPC client.
 *  - `getTransactionReceipt` returns `{ status: "Pending" }`. Same
 *    reason — needs an RPC.
 *  - `switchChain` updates butr's view of the current Solana cluster
 *    locally and routes subsequent `signAndSendTransaction` calls
 *    through the new chain. Wallet Standard has no "tell the wallet
 *    to switch cluster" RPC; the wallet's own UI controls its global
 *    cluster setting, and `signAndSendTransaction` accepts the chain
 *    per-call. The chain must be one the wallet advertises in
 *    `wallet.chains`; otherwise the call rejects.
 *  - `requestAccounts` re-runs `standard:connect`. Some wallets show
 *    their account picker again; others (those that "remember"
 *    authorisations) silently return the existing accounts. butr
 *    refreshes the pool entry's `accounts` array either way.
 *  - `switchAccount` is intentionally unimplemented. Wallet Standard
 *    has no silent "use address X" feature — the user picks the active
 *    account through the wallet's own UI. `signAndSendTransaction`
 *    accepts an `account` input, so consumers needing per-tx address
 *    selection can pick one from `accounts` at call time.
 */
const buildSvmAdapter = (wallet: WalletStandardWallet): WalletAdapter | null => {
  const solanaChainId = pickSolanaChain(wallet);
  if (!solanaChainId) {
    return null;
  }
  const connect = getFeature<StandardConnectFeature>(wallet, "standard:connect");
  if (!connect) {
    return null;
  }

  const disconnect = getFeature<StandardDisconnectFeature>(wallet, "standard:disconnect");
  const events = getFeature<StandardEventsFeature>(wallet, "standard:events");
  const signMessage = getFeature<SolanaSignMessageFeature>(wallet, "solana:signMessage");
  const signAndSendTx = getFeature<SolanaSignAndSendTransactionFeature>(
    wallet,
    "solana:signAndSendTransaction",
  );

  // Current Solana cluster. Mutable so `switchChain` can route subsequent
  // `signAndSendTransaction` calls through a different cluster without
  // rebuilding the adapter. butr's reducer learns about chain changes
  // via the `accountChanged` events emitted to subscribers below.
  let currentChainId = solanaChainId;
  const currentChain = (): ChainBase => buildSolanaChain(currentChainId, wallet.name);

  // Local listener set so `switchChain` (and `requestAccounts`) can
  // synthesise `accountChanged` events that flow into butr's pool.
  // Wallet-native events from `standard:events` are bridged alongside.
  const listeners = new Set<(event: ConnectorEvent) => void>();
  const notifyAccountChanged = () => {
    const address = pickFirstAddress(wallet.accounts);
    if (!address) {
      return;
    }
    const account = buildSolanaAccount(address, currentChain());
    for (const listener of listeners) {
      listener({ account, type: "accountChanged" });
    }
  };

  return {
    capabilities: {
      // Wallet Standard has no balance/receipt RPC. Consumers wrap
      // their own RPC client (e.g. butr/svm-rpc once it ships).
      getBalance: false,
      getTransactionReceipt: false,
      // Wallet Standard has no programmatic equivalent of EIP-2255 —
      // wallets expose all the user's accounts at connect time, and
      // adding more is a wallet-UI operation. Re-running
      // `standard:connect` is the closest we can do, but it doesn't
      // produce new accounts on any major Wallet Standard wallet in
      // practice (Phantom Solana, MetaMask Snap, Solflare, Backpack).
      // Set false so consumers don't render a button that won't do
      // anything visible.
      requestAccounts: false,
      sendTransaction: Boolean(signAndSendTx),
      signMessage: Boolean(signMessage),
      subscribe: Boolean(events),
      // Wallet Standard has no silent account-switch feature.
      switchAccount: false,
      // Switching only makes sense if the wallet advertises >1 chain.
      switchChain: wallet.chains.length > 1,
    },
    chainPlatform: "svm",

    async connect() {
      await connect.connect();
    },

    async disconnect() {
      if (disconnect) {
        try {
          await disconnect.disconnect();
        } catch (error) {
          console.warn("[butr] Wallet Standard disconnect threw:", error);
        }
      }
    },

    getAccount() {
      const address = pickFirstAddress(wallet.accounts);
      if (!address) {
        return Promise.resolve(null);
      }
      return Promise.resolve(buildSolanaAccount(address, currentChain()));
    },

    getAccounts() {
      const chain = currentChain();
      return Promise.resolve(wallet.accounts.map((a) => buildSolanaAccount(a.address, chain)));
    },

    getBalance() {
      // Wallet Standard exposes no balance feature. Consumers wrap
      // their own RPC client; this default keeps the type signature
      // honoured without lying about a value we don't have.
      return Promise.resolve({
        decimals: SOLANA_DECIMALS,
        formatted: "0",
        symbol: "SOL",
        value: 0n,
      });
    },

    getSigner() {
      // Consumers cast to their preferred wrapper (e.g. an Anchor
      // provider built around the wallet's signTransaction feature).
      return Promise.resolve(wallet);
    },

    getTransactionReceipt() {
      // Same reason as `getBalance` — no RPC.
      return Promise.resolve({ status: "Pending" as const });
    },

    icon: wallet.icon,
    id: slugify(wallet.name),
    name: wallet.name,

    async requestAccounts() {
      // Wallet Standard has no equivalent of EIP-2255's
      // `wallet_requestPermissions`. The closest we can do is re-run
      // `standard:connect`, which prompts the user on wallets that
      // surface their picker each time and silently returns the
      // existing list on wallets that remember authorisations.
      // butr's runtime calls `getAccounts()` afterwards to refresh
      // the pool entry, so newly-exposed addresses appear either way.
      await connect.connect();
    },

    async sendTx(tx, account) {
      if (!signAndSendTx) {
        throw new Error(`Wallet ${wallet.name} does not advertise solana:signAndSendTransaction`);
      }
      const wsAccount = account
        ? pickAccountByAddress(wallet.accounts, account.walletAddress)
        : (wallet.accounts[0] ?? null);
      if (!wsAccount) {
        throw new Error("No connected account");
      }
      if (!(tx instanceof Uint8Array)) {
        throw new TypeError("SVM sendTx expects a serialized transaction (Uint8Array)");
      }
      const [output] = await signAndSendTx.signAndSendTransaction({
        account: wsAccount,
        chain: currentChainId,
        transaction: tx,
      });
      if (!output) {
        throw new Error("signAndSendTransaction returned no outputs");
      }
      return bytesToBase64(output.signature);
    },

    sendTxToChain(tx, _targetChainId, account, cb) {
      // Solana Wallet Standard's signAndSendTransaction takes the
      // target chain directly. `targetChainId` is the decimal-string
      // form butr uses, but the wallet expects a CAIP-2 chain string.
      // For now we honour the connector's primary `solanaChainId` and
      // let consumers route per-chain at a higher level if they need
      // multi-cluster support.
      cb?.();
      return this.sendTx(tx, account);
    },

    async signMessage(msg, account) {
      if (!signMessage) {
        throw new Error(`Wallet ${wallet.name} does not advertise solana:signMessage`);
      }
      const wsAccount = account
        ? pickAccountByAddress(wallet.accounts, account.walletAddress)
        : (wallet.accounts[0] ?? null);
      if (!wsAccount) {
        throw new Error("No connected account");
      }
      const [output] = await signMessage.signMessage({ account: wsAccount, message: msg });
      if (!output) {
        throw new Error("signMessage returned no outputs");
      }
      return { signature: output.signature, signedMessage: output.signedMessage };
    },

    subscribe(listener) {
      listeners.add(listener);
      let unsubWallet: (() => void) | null = null;
      if (events) {
        const unsub = events.on("change", (changes) => {
          if (!changes.accounts) {
            return;
          }
          if (changes.accounts.length === 0) {
            listener({ type: "disconnected" });
            return;
          }
          const first = changes.accounts[0];
          if (!first) {
            return;
          }
          listener({
            account: buildSolanaAccount(first.address, currentChain()),
            type: "accountChanged",
          });
        });
        unsubWallet = () => unsub();
      }
      return () => {
        listeners.delete(listener);
        unsubWallet?.();
      };
    },

    switchChain(chain) {
      if (chain.namespace !== "solana") {
        throw new Error(
          `SVM adapter received non-Solana chain "${chain.id}". Pass a chain with namespace "solana".`,
        );
      }
      // The wallet must advertise this cluster — otherwise
      // signAndSendTransaction will reject the chain string later.
      if (!wallet.chains.includes(chain.id)) {
        throw new Error(
          `Wallet ${wallet.name} does not advertise chain "${chain.id}". Available: ${wallet.chains.join(", ")}`,
        );
      }
      currentChainId = chain.id;
      // Synthesise an `accountChanged` so butr's reducer updates the
      // pool entry's chain — the wallet itself has no event to fire here.
      notifyAccountChanged();
      return Promise.resolve();
    },
  };
};

export { buildSvmAdapter, slugify };
