import type { Account, ChainBase, WalletAdapter, WalletCapabilities } from "../types";

/**
 * Minimal type surface for `@ledgerhq/hw-app-eth`. Declared inline
 * rather than imported so butr's typecheck pipeline doesn't depend
 * on the optional peer dep being installed. Real Ledger app instances
 * satisfy this shape.
 */
type EthAppLike = {
  getAddress(
    path: string,
    boolDisplay?: boolean,
    boolChaincode?: boolean,
  ): Promise<{ address: string; publicKey: string }>;
  signPersonalMessage(
    path: string,
    messageHex: string,
  ): Promise<{ r: string; s: string; v: number }>;
  signTransaction(
    path: string,
    rawTxHex: string,
    resolution?: unknown,
  ): Promise<{ r: string; s: string; v: string }>;
};

type EthAppConstructor = new (transport: unknown) => EthAppLike;

type TransportLike = {
  close(): Promise<void>;
};

type TransportFactory = {
  create(timeout?: number): Promise<TransportLike>;
};

type LedgerOptions = {
  /**
   * How many accounts to enumerate via `getAccounts()`. Each path
   * walk hits the device (~1-2 s per address), so larger values are
   * slow. Default: 1.
   */
  accountCount?: number;
  /**
   * EIP-155 chain id the adapter signs against. Stored locally —
   * Ledger has no internal "current chain" concept; `chainId`
   * enters the signing pipeline per-tx. butr's `switchChain` updates
   * this value and emits an `accountChanged` event so the pool
   * entry's chain reflects the new view.
   *
   * Defaults to `1` (Ethereum mainnet).
   */
  chainId?: number;
  /**
   * BIP-32 derivation path *prefix*. `getAccounts(n)` appends the
   * account index. Defaults to `"44'/60'/0'/0"` (the standard
   * Ethereum path; account 0 lives at `"44'/60'/0'/0/0"`).
   */
  derivationPathPrefix?: string;
  /**
   * DI override for the `Eth` app constructor (tests). When omitted,
   * the adapter dynamic-imports `@ledgerhq/hw-app-eth`.
   */
  eth?: EthAppConstructor;
  /** Override the wallet icon shown in pickers. */
  icon?: string;
  /** Override the connector id. Default `"ledger"`. */
  id?: string;
  /** Override the wallet name. Default `"Ledger"`. */
  name?: string;
  /**
   * DI override for the WebUSB transport factory (tests). When
   * omitted, the adapter dynamic-imports
   * `@ledgerhq/hw-transport-webusb`.
   */
  transport?: TransportFactory;
};

const DEFAULT_DERIVATION_PATH_PREFIX = "44'/60'/0'/0";
const DEFAULT_CHAIN_ID = 1;

const DEFAULT_ICON =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzAwMCI+PHJlY3QgeD0iMyIgeT0iNyIgd2lkdGg9IjEzIiBoZWlnaHQ9IjEwIiByeD0iMSIvPjxyZWN0IHg9IjE3IiB5PSI3IiB3aWR0aD0iNCIgaGVpZ2h0PSIzIiBmaWxsPSIjMDAwIi8+PHJlY3QgeD0iMTciIHk9IjE0IiB3aWR0aD0iNCIgaGVpZ2h0PSIzIiBmaWxsPSIjMDAwIi8+PHJlY3QgeD0iNiIgeT0iMTAiIHdpZHRoPSI3IiBoZWlnaHQ9IjQiIGZpbGw9IiNmZmYiLz48L3N2Zz4=";

const loadEth = async (): Promise<EthAppConstructor> => {
  const mod = (await import("@ledgerhq/hw-app-eth")) as unknown as {
    default?: EthAppConstructor;
    Eth?: EthAppConstructor;
  };
  const ctor = mod.default ?? mod.Eth;
  if (!ctor) {
    throw new Error(
      "[butr/ledger] failed to load @ledgerhq/hw-app-eth — install it as an optional peer dep",
    );
  }
  return ctor;
};

const loadTransport = async (): Promise<TransportFactory> => {
  const mod = (await import("@ledgerhq/hw-transport-webusb")) as unknown as {
    default?: TransportFactory;
  };
  if (!mod.default) {
    throw new Error(
      "[butr/ledger] failed to load @ledgerhq/hw-transport-webusb — install it as an optional peer dep",
    );
  }
  return mod.default;
};

const buildEvmChain = (chainId: number, walletName: string): ChainBase => ({
  id: `eip155:${chainId}`,
  // Same stance as the EIP-6963 adapter — butr doesn't ship a chain
  // id → name table. Consumers overlay via structural typing.
  name: walletName,
  namespace: "eip155",
  reference: chainId.toString(),
});

const buildEvmAccount = (address: string, chain: ChainBase): Account => ({
  chain,
  id: `${chain.id}:${address.toLowerCase()}`,
  walletAddress: address,
});

const buildCapabilities = (): WalletCapabilities => ({
  // Ledger only signs — it doesn't speak RPC. Balance, receipt, and
  // tx broadcast all require an external RPC client (viem/ethers).
  // butr surfaces these as `false` so demos / pickers don't render
  // affordances that would throw.
  getBalance: false,
  getTransactionReceipt: false,
  // Ledger has no concept of permission granting; pairing IS the
  // grant. "Request more accounts" would be "walk more derivation
  // paths," which is the `accountCount` config — not a runtime UI
  // affordance.
  requestAccounts: false,
  sendTransaction: false,
  signMessage: true,
  // No event stream — the device doesn't emit. Account/chain changes
  // happen through butr's mutation actions (`updateWalletAccount`,
  // `switchChain`) which trigger the necessary updates directly.
  subscribe: false,
  switchAccount: false,
  // Local state — Ledger doesn't have a "current chain"; chainId is
  // baked into every signed payload. `switchChain` updates the
  // adapter's chainId field.
  switchChain: true,
});

const SUBSCRIBE_NOT_AVAILABLE = "[butr/ledger] subscribe is not implemented — device emits no events";

/**
 * Build a Ledger hardware-wallet adapter usable with butr's
 * `WalletManagerConfig.createConnector`. The returned adapter is
 * fully-formed but UN-paired — pairing happens when butr's runtime
 * calls `adapter.connect()`, at which point the browser shows the
 * WebUSB permission prompt and the user unlocks their Ledger.
 *
 * @example
 * ```ts
 * const ledger = await createLedgerAdapter({
 *   chainId: 1,           // Ethereum mainnet
 *   accountCount: 3,      // expose 3 derivation paths
 * });
 *
 * const config: WalletManagerConfig = {
 *   connectors: [{ id: ledger.id, name: ledger.name, chainPlatform: "evm" }],
 *   createConnector: (id) => (id === ledger.id ? ledger : null),
 * };
 * ```
 *
 * **Browser support**: WebUSB works in Chromium-based browsers
 * (Chrome, Edge, Brave, Arc). Firefox and Safari don't ship WebUSB
 * — a future WebHID transport would cover Safari but isn't wired
 * here.
 *
 * **Signing only**: Ledger signs messages and transactions but
 * doesn't broadcast. `sendTx` / `sendTxToChain` / `getBalance` /
 * `getTransactionReceipt` throw; the capability flags are `false`
 * so well-behaved consumers skip those affordances. Wrap the signer
 * (via `getSigner()`) with viem / ethers and your own RPC client
 * to complete the send pipeline.
 */
const createLedgerAdapter = async (options: LedgerOptions = {}): Promise<WalletAdapter> => {
  const id = options.id ?? "ledger";
  const name = options.name ?? "Ledger";
  const icon = options.icon ?? DEFAULT_ICON;
  const derivationPathPrefix = options.derivationPathPrefix ?? DEFAULT_DERIVATION_PATH_PREFIX;
  const accountCount = Math.max(1, options.accountCount ?? 1);

  let chainId = options.chainId ?? DEFAULT_CHAIN_ID;
  let transport: TransportLike | null = null;
  let eth: EthAppLike | null = null;
  let currentAddress: string | null = null;

  const pathAt = (index: number): string => `${derivationPathPrefix}/${index}`;

  const adapter: WalletAdapter = {
    capabilities: buildCapabilities(),
    chainPlatform: "evm",

    async connect() {
      const TransportFactory = options.transport ?? (await loadTransport());
      const EthApp = options.eth ?? (await loadEth());
      transport = await TransportFactory.create();
      eth = new EthApp(transport);
      const { address } = await eth.getAddress(pathAt(0));
      currentAddress = address;
    },

    async disconnect() {
      try {
        await transport?.close();
      } catch (error) {
        console.warn("[butr/ledger] transport.close threw:", error);
      }
      transport = null;
      eth = null;
      currentAddress = null;
    },

    async getAccount() {
      if (!currentAddress) {
        return null;
      }
      return buildEvmAccount(currentAddress, buildEvmChain(chainId, name));
    },

    async getAccounts() {
      if (!eth) {
        return [];
      }
      const chain = buildEvmChain(chainId, name);
      const accounts: Array<Account> = [];
      // Sequential walk — the device serialises USB requests; parallel
      // calls would deadlock the transport. Slow but correct.
      for (let i = 0; i < accountCount; i += 1) {
        const { address } = await eth.getAddress(pathAt(i));
        accounts.push(buildEvmAccount(address, chain));
      }
      return accounts;
    },

    getBalance() {
      // Capabilities flag is `false`; this throw is defence-in-depth.
      // Consumers should never call this — but if they do, fail loud.
      return Promise.reject(
        new Error(
          "[butr/ledger] getBalance not supported — Ledger has no RPC. Use viem/ethers with your own RPC URL.",
        ),
      );
    },

    getSigner() {
      // Hands the raw Eth app to consumers who want to wrap it
      // (e.g. viem's `toAccount(({ getAddresses, signMessage, signTransaction }) => …)`).
      return Promise.resolve(eth);
    },

    getTransactionReceipt() {
      return Promise.reject(
        new Error(
          "[butr/ledger] getTransactionReceipt not supported — Ledger has no RPC.",
        ),
      );
    },

    icon,
    id,
    name,

    sendTx() {
      return Promise.reject(
        new Error(
          "[butr/ledger] sendTx not supported — Ledger signs but doesn't broadcast. Use `getSigner()` + viem/ethers.",
        ),
      );
    },

    sendTxToChain() {
      return Promise.reject(
        new Error(
          "[butr/ledger] sendTxToChain not supported — Ledger signs but doesn't broadcast. Use `getSigner()` + viem/ethers.",
        ),
      );
    },

    async signMessage(message, account) {
      if (!eth) {
        throw new Error("[butr/ledger] not connected — call connect() first");
      }
      // If the consumer passed an `account`, derive which path it
      // corresponds to by walking the configured accountCount. For
      // single-account configs this short-circuits on iteration 0.
      let path = pathAt(0);
      if (account && account.walletAddress.toLowerCase() !== currentAddress?.toLowerCase()) {
        let matched = false;
        for (let i = 0; i < accountCount; i += 1) {
          const candidatePath = pathAt(i);
          const { address } = await eth.getAddress(candidatePath);
          if (address.toLowerCase() === account.walletAddress.toLowerCase()) {
            path = candidatePath;
            matched = true;
            break;
          }
        }
        if (!matched) {
          throw new Error(
            `[butr/ledger] address ${account.walletAddress} not found on this device within ${accountCount} derivation paths`,
          );
        }
      }
      // Ledger's signPersonalMessage expects a hex string WITHOUT
      // the `0x` prefix and signs the keccak-prefixed message as
      // EIP-191 dictates. Format the signature back to a standard
      // 65-byte (r || s || v) Uint8Array.
      const hex = Array.from(message)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const { r, s, v } = await eth.signPersonalMessage(path, hex);
      const sigHex = `${r.padStart(64, "0")}${s.padStart(64, "0")}${v.toString(16).padStart(2, "0")}`;
      const signature = new Uint8Array(sigHex.length / 2);
      for (let i = 0; i < signature.length; i += 1) {
        signature[i] = Number.parseInt(sigHex.slice(i * 2, i * 2 + 2), 16);
      }
      return { signature, signedMessage: message };
    },

    subscribe() {
      // No-op — Ledger emits no events. Capabilities flag is `false`;
      // this returns an unsubscribe function so call sites that
      // unconditionally subscribe don't break.
      void SUBSCRIBE_NOT_AVAILABLE;
      return () => {};
    },

    async switchAccount() {
      throw new Error(
        "[butr/ledger] switchAccount not supported — pick a different account via signMessage(msg, account) using a different derivation path",
      );
    },

    async switchChain(chain) {
      if (chain.namespace !== "eip155") {
        throw new Error(
          `[butr/ledger] received non-EVM chain "${chain.id}". Pass a chain with namespace "eip155".`,
        );
      }
      const next = Number.parseInt(chain.reference, 10);
      if (!Number.isFinite(next)) {
        throw new Error(`[butr/ledger] chain reference is not a number: ${chain.reference}`);
      }
      chainId = next;
    },
  };

  return adapter;
};

export type { EthAppConstructor, EthAppLike, LedgerOptions, TransportFactory, TransportLike };
export { DEFAULT_ICON as LEDGER_DEFAULT_ICON, createLedgerAdapter };
