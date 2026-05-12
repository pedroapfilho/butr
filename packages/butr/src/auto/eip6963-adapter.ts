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
// EIP-6963 wallets that don't implement EIP-2255 `wallet_requestPermissions`
// — calling `requestAccounts` falls back to `eth_requestAccounts`, which
// won't reopen the picker, so the button would be a no-op for the user.
// Listed by `rdns` (the stable identifier per EIP-6963 §Wallet.info).
// Add more entries as wallets are verified.
const RDNS_WITHOUT_REQUEST_ACCOUNTS = new Set<string>([
  "app.phantom", // Phantom's EVM provider — verified May 2026
]);

const buildEvmAdapter = (info: Eip6963ProviderInfo, provider: Eip1193Provider): WalletAdapter => {
  return {
    capabilities: {
      getBalance: true,
      getTransactionReceipt: true,
      // True by default; false for wallets known not to honour
      // EIP-2255 (the fallback to `eth_requestAccounts` is a no-op
      // there, so we hide the button rather than render a dead one).
      requestAccounts: !RDNS_WITHOUT_REQUEST_ACCOUNTS.has(info.rdns),
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
      // Preferred path: EIP-2255 `wallet_requestPermissions` reopens the
      // wallet's account-picker UI; the user chooses which additional
      // accounts to expose. MetaMask, Rabby, and Brave implement this.
      // Fallback: wallets that don't implement EIP-2255 (notably
      // Phantom's EVM provider) reject with code 4200 or -32601. We fall
      // through to `eth_requestAccounts`, which won't reopen the picker
      // but at least refreshes the exposed list and surfaces newly-
      // added accounts after the user adds them in the wallet UI.
      try {
        await provider.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch (error: unknown) {
        const code = (error as { code?: number } | null)?.code;
        // EIP-1474 "method not supported" / JSON-RPC "method not found"
        if (code === 4200 || code === -32601) {
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
        const first = accs[0];
        if (!first) {
          return;
        }
        // Need chain id to build a complete Account.
        void provider
          .request({ method: "eth_chainId" })
          // oxlint-disable-next-line promise/prefer-await-to-then -- callback context, not async
          .then((chainIdHex) => {
            const chain = buildEvmChain(chainIdHex as string, info.name);
            listener({ account: buildEvmAccount(first, chain), type: "accountChanged" });
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
            const first = accs[0];
            if (!first) {
              return undefined;
            }
            const chain = buildEvmChain(chainIdHex, info.name);
            listener({ account: buildEvmAccount(first, chain), type: "accountChanged" });
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
