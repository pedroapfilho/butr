import type { Account, ChainBase, WalletAdapter } from "../types";
import type { Eip1193Listener, Eip1193Provider, Eip6963ProviderInfo } from "./eip1193";

const HEX_PREFIX = "0x";
const ETH_DECIMALS = 18n;
const ETH_UNIT = 10n ** ETH_DECIMALS;

/**
 * Convert a hex string (with or without `0x` prefix) into a Uint8Array.
 * Odd-length strings are not supported; EIP-1193 returns canonical
 * even-length hex.
 */
const hexToBytes = (hex: string): Uint8Array => {
  const clean = hex.startsWith(HEX_PREFIX) ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

const bytesToHex = (bytes: Uint8Array): string => {
  let hex = HEX_PREFIX;
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
};

const chainIdHexToDecimal = (hex: string): string => BigInt(hex).toString(10);
const chainIdDecimalToHex = (dec: string): string => `${HEX_PREFIX}${BigInt(dec).toString(16)}`;

/** Pure 18-decimal wei → ether formatter. Trims trailing zeros so
 *  `1.0` stays `1` and `1.5` stays `1.5`. */
const formatEther = (wei: bigint): string => {
  const integer = wei / ETH_UNIT;
  const remainder = wei % ETH_UNIT;
  if (remainder === 0n) {
    return integer.toString();
  }
  const fraction = remainder.toString().padStart(Number(ETH_DECIMALS), "0").replace(/0+$/, "");
  return fraction.length > 0 ? `${integer}.${fraction}` : integer.toString();
};

const buildEvmChain = (chainIdHex: string, walletName: string): ChainBase => {
  const reference = chainIdHexToDecimal(chainIdHex);
  return {
    id: `eip155:${reference}`,
    // We don't ship a chain-id → name table because that's a
    // domain decision (mainnet, sepolia, base, polygon, …). Consumers
    // overlay their own name via structural typing if needed.
    name: walletName,
    namespace: "eip155",
    reference,
  };
};

const buildEvmAccount = (address: string, chain: ChainBase): Account => ({
  chain,
  id: `${chain.id}:${address.toLowerCase()}`,
  walletAddress: address,
});

/**
 * Adapt an EIP-1193 provider (announced via EIP-6963) into a butr
 * `WalletAdapter`. The returned adapter covers the full `Connector +
 * Wallet` surface; consumers can pass it through `createConnector` like
 * any hand-written adapter.
 *
 * **Caveats**
 *
 *  - `disconnect` calls `wallet_revokePermissions`. Many wallets don't
 *    implement that method and silently ignore the call. The reducer
 *    will still mark the wallet as disconnected on butr's side; the
 *    wallet's own auto-reconnect heuristic may or may not honour it.
 *  - `switchAccount` is intentionally unimplemented because EIP-1193 has
 *    no silent "use address X" RPC. The active account is whichever one
 *    the wallet exposes first; the user changes it through the wallet's
 *    own UI. butr's `subscribe` bridge auto-updates the pool entry when
 *    `accountsChanged` fires. Call `requestAccounts` if you want the
 *    wallet to expose more accounts.
 *  - `getBalance` returns the native ETH balance with symbol `"ETH"`,
 *    regardless of which EVM chain the wallet is currently on. Consumers
 *    that target multiple EVM chains should overlay the symbol via
 *    their own logic.
 *  - `getSigner` returns the raw EIP-1193 provider. Wrap it in viem's
 *    `createWalletClient` or ethers' `BrowserProvider` at the call site.
 */
// Allow-list of EIP-6963 wallets where `requestAccounts` does
// something user-visible (reopens the wallet's account picker via
// EIP-2255 `wallet_requestPermissions`). MetaMask is the only wallet
// that implements this the way the spec intends — every other tested
// wallet either rejects the method (Phantom EVM, Coinbase Wallet) or
// silently returns the existing accounts (Rabby, OKX, Binance,
// Backpack EVM), making the UI button a no-op for the user. The
// inverted default avoids rendering a button that does nothing.
//
// Listed by `rdns` (EIP-6963 §Wallet.info). Add a wallet here only
// after verifying that calling `requestAccounts` actually surfaces
// a picker UI to the user.
const RDNS_WITH_REQUEST_ACCOUNTS = new Set<string>([
  "io.metamask", // MetaMask — verified May 2026
]);

const buildEvmAdapter = (info: Eip6963ProviderInfo, provider: Eip1193Provider): WalletAdapter => {
  return {
    capabilities: {
      getBalance: true,
      getTransactionReceipt: true,
      // False by default; true only for wallets in the allow-list
      // above. Most EVM wallets either reject EIP-2255 or silently
      // return existing accounts, so the UI button would be a no-op.
      // Consumers can still call `connector.requestAccounts()`
      // manually for wallet-specific flows — the method exists, the
      // capability flag just gates the affordance.
      requestAccounts: RDNS_WITH_REQUEST_ACCOUNTS.has(info.rdns),
      sendTransaction: true,
      signMessage: true,
      subscribe: true,
      // EIP-1193 has no silent "use address X" RPC. Always false for
      // auto-built EVM adapters.
      switchAccount: false,
      switchChain: true,
    },
    chainPlatform: "evm",

    async connect() {
      await provider.request({ method: "eth_requestAccounts" });
    },

    async disconnect() {
      try {
        await provider.request({
          method: "wallet_revokePermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch {
        // Many wallets don't implement wallet_revokePermissions yet —
        // not a failure.
      }
    },

    async getAccount() {
      const accounts = (await provider.request({ method: "eth_accounts" })) as Array<string>;
      if (accounts.length === 0) {
        return null;
      }
      const chainIdHex = (await provider.request({ method: "eth_chainId" })) as string;
      const chain = buildEvmChain(chainIdHex, info.name);
      const first = accounts[0];
      if (!first) {
        return null;
      }
      return buildEvmAccount(first, chain);
    },

    async getAccounts() {
      const accounts = (await provider.request({ method: "eth_accounts" })) as Array<string>;
      if (accounts.length === 0) {
        return [];
      }
      const chainIdHex = (await provider.request({ method: "eth_chainId" })) as string;
      const chain = buildEvmChain(chainIdHex, info.name);
      return accounts.map((addr) => buildEvmAccount(addr, chain));
    },

    async getBalance() {
      const accounts = (await provider.request({ method: "eth_accounts" })) as Array<string>;
      const first = accounts[0];
      if (!first) {
        throw new Error("No connected account");
      }
      const balanceHex = (await provider.request({
        method: "eth_getBalance",
        params: [first, "latest"],
      })) as string;
      const value = BigInt(balanceHex);
      return {
        decimals: Number(ETH_DECIMALS),
        formatted: formatEther(value),
        symbol: "ETH",
        value,
      };
    },

    getSigner() {
      // Consumers cast this to a viem WalletClient / ethers
      // BrowserProvider / their preferred wrapper.
      return Promise.resolve(provider);
    },

    async getTransactionReceipt(tx) {
      const receipt = (await provider.request({
        method: "eth_getTransactionReceipt",
        params: [tx],
      })) as { status: string } | null;
      if (!receipt) {
        return { status: "Pending" };
      }
      return { status: receipt.status === "0x1" ? "Success" : "Error" };
    },

    icon: info.icon,
    id: info.rdns,
    name: info.name,

    async requestAccounts() {
      // Preferred path: EIP-2255 `wallet_requestPermissions` reopens
      // the wallet's account-picker UI so the user can grant new
      // accounts. In practice, MetaMask is the only major EVM wallet
      // that actually surfaces a fresh picker — Rabby / OKX / Binance
      // / Backpack silently return existing accounts; Phantom EVM and
      // Coinbase Wallet reject with `method not supported`. The
      // `capabilities` layer (`RDNS_WITH_REQUEST_ACCOUNTS`) gates the
      // demo button so users only see it where it'll do something
      // visible; this method stays callable for consumers with
      // wallet-specific flows.
      //
      // Fallback: rejecting wallets get routed through
      // `eth_requestAccounts`, which at least doesn't throw. It won't
      // reopen the picker but surfaces newly-added accounts on the
      // next read.
      try {
        await provider.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch (error: unknown) {
        const err = error as { code?: number; data?: { originalError?: { code?: number } } } | null;
        const outerCode = err?.code;
        const innerCode = err?.data?.originalError?.code;
        const isMethodNotSupported =
          outerCode === 4200 || // EIP-1474 "method not supported"
          outerCode === -32601 || // JSON-RPC "method not found"
          outerCode === -32603 || // JSON-RPC "internal error" (Coinbase wraps -32604 here)
          innerCode === 4200 ||
          innerCode === -32601 ||
          innerCode === -32604; // Coinbase's custom "method not supported"
        if (isMethodNotSupported) {
          await provider.request({ method: "eth_requestAccounts" });
          return;
        }
        throw error;
      }
    },

    async sendTx(tx, account) {
      const txWithFrom = account
        ? { ...(tx as Record<string, unknown>), from: account.walletAddress }
        : tx;
      const hash = (await provider.request({
        method: "eth_sendTransaction",
        params: [txWithFrom],
      })) as string;
      return hash;
    },

    async sendTxToChain(tx, targetChainIdDecimal, account, cb) {
      const current = (await provider.request({ method: "eth_chainId" })) as string;
      const targetHex = chainIdDecimalToHex(targetChainIdDecimal);
      if (current.toLowerCase() !== targetHex.toLowerCase()) {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: targetHex }],
        });
        cb?.();
      }
      const txWithFrom = account
        ? { ...(tx as Record<string, unknown>), from: account.walletAddress }
        : tx;
      const hash = (await provider.request({
        method: "eth_sendTransaction",
        params: [txWithFrom],
      })) as string;
      return hash;
    },

    async signMessage(msg, account) {
      // Default to the first exposed account when the caller doesn't
      // specify one. MetaMask requires the address to be one currently
      // exposed via `eth_requestAccounts`; pass any address from
      // `ConnectedWallet.accounts` to sign with a non-active one.
      let signer = account?.walletAddress;
      if (!signer) {
        const accounts = (await provider.request({ method: "eth_accounts" })) as Array<string>;
        signer = accounts[0];
      }
      if (!signer) {
        throw new Error("No connected account");
      }
      const signatureHex = (await provider.request({
        method: "personal_sign",
        params: [bytesToHex(msg), signer],
      })) as string;
      return { signature: hexToBytes(signatureHex), signedMessage: msg };
    },

    subscribe(listener) {
      const onAccountsChanged: Eip1193Listener = (...args) => {
        const accs = args[0] as Array<string>;
        if (accs.length === 0) {
          listener({ type: "disconnected" });
          return;
        }
        // Forward the FULL accounts array — `accountsChanged` reflects
        // the wallet's current exposure set, not an incremental add.
        // The runtime mirrors this list verbatim into the pool entry,
        // so single-account-exposure wallets (Phantom EVM) don't end
        // up with stale, non-signable addresses lingering in the array.
        void provider
          .request({ method: "eth_chainId" })
          // oxlint-disable-next-line promise/prefer-await-to-then -- callback context, not async
          .then((chainIdHex) => {
            const chain = buildEvmChain(chainIdHex as string, info.name);
            const accounts = accs.map((addr) => buildEvmAccount(addr, chain));
            const first = accounts[0];
            if (!first) {
              return undefined;
            }
            listener({ account: first, accounts, type: "accountChanged" });
            return undefined;
          })
          // oxlint-disable-next-line promise/prefer-await-to-then -- callback context, not async
          .catch(() => {
            // Drop silently — next event will retry the read.
          });
      };

      const onChainChanged: Eip1193Listener = (...args) => {
        const chainIdHex = args[0] as string;
        void provider
          .request({ method: "eth_accounts" })
          // oxlint-disable-next-line promise/prefer-await-to-then -- callback context, not async
          .then((accounts) => {
            const accs = accounts as Array<string>;
            if (accs.length === 0) {
              return undefined;
            }
            const chain = buildEvmChain(chainIdHex, info.name);
            const built = accs.map((addr) => buildEvmAccount(addr, chain));
            const first = built[0];
            if (!first) {
              return undefined;
            }
            listener({ account: first, accounts: built, type: "accountChanged" });
            return undefined;
          })
          // oxlint-disable-next-line promise/prefer-await-to-then -- callback context, not async
          .catch(() => {
            // Drop silently.
          });
      };

      const onDisconnect: Eip1193Listener = () => {
        listener({ type: "disconnected" });
      };

      provider.on("accountsChanged", onAccountsChanged);
      provider.on("chainChanged", onChainChanged);
      provider.on("disconnect", onDisconnect);

      return () => {
        provider.removeListener("accountsChanged", onAccountsChanged);
        provider.removeListener("chainChanged", onChainChanged);
        provider.removeListener("disconnect", onDisconnect);
      };
    },

    async switchChain(chain) {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainIdDecimalToHex(chain.reference) }],
      });
    },
  };
};

export {
  buildEvmAdapter,
  bytesToHex,
  chainIdDecimalToHex,
  chainIdHexToDecimal,
  formatEther,
  hexToBytes,
};
