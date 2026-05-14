import type {
  Account,
  ChainPlatform,
  WalletAdapter,
  WalletCapabilities,
} from "@butr/core";

type FakeAdapterOptions = {
  accounts?: Array<Account>;
  capabilities?: Partial<WalletCapabilities>;
  chainPlatform?: ChainPlatform;
  icon?: string;
  id?: string;
  name?: string;
};

const DEFAULT_CAPABILITIES: WalletCapabilities = {
  getBalance: true,
  getTransactionReceipt: true,
  requestAccounts: true,
  sendTransaction: true,
  signMessage: true,
  subscribe: true,
  switchAccount: true,
  switchChain: true,
};

/**
 * Build a fully-configured fake `WalletAdapter` for tests. Every method
 * resolves to a deterministic stub value. Override individual methods
 * on the returned object after construction to introduce failure modes:
 *
 * ```ts
 * const adapter = createFakeAdapter({ id: "metamask" });
 * adapter.connect = () => Promise.reject(new Error("user rejected"));
 * ```
 */
const createFakeAdapter = (options: FakeAdapterOptions = {}): WalletAdapter => {
  const id = options.id ?? "fake";
  const name = options.name ?? "Fake Wallet";
  const chainPlatform: ChainPlatform = options.chainPlatform ?? "evm";
  const accounts = options.accounts ?? [];
  const account = accounts[0] ?? null;
  const icon = options.icon;

  return {
    capabilities: { ...DEFAULT_CAPABILITIES, ...options.capabilities },
    chainPlatform,
    icon,
    id,
    name,
    connect: () => Promise.resolve(),
    disconnect: () => Promise.resolve(),
    getAccount: () => Promise.resolve(account),
    getAccounts: () => Promise.resolve(accounts),
    requestAccounts: () => Promise.resolve(),
    subscribe: () => () => {},
    getBalance: () =>
      Promise.resolve({
        decimals: 18,
        formatted: "0",
        symbol: chainPlatform === "evm" ? "ETH" : "SOL",
        value: 0n,
      }),
    getSigner: () => Promise.resolve({}),
    getTransactionReceipt: () => Promise.resolve({ status: "Success" as const }),
    sendTx: () => Promise.resolve("0xfakehash"),
    sendTxToChain: () => Promise.resolve("0xfakehash"),
    signMessage: (msg) => Promise.resolve({ signature: msg, signedMessage: msg }),
    switchAccount: () => Promise.resolve(),
    switchChain: () => Promise.resolve(),
  };
};

export type { FakeAdapterOptions };
export { createFakeAdapter };
