import type {
  Account,
  Balance,
  ChainBase,
  ChainPlatform,
  ConnectorMeta,
  SignInInput,
  UIConnector,
  WalletMode,
} from "butr";

const ETHEREUM_CHAIN: ChainBase = {
  id: "eip155:1",
  name: "Ethereum",
  namespace: "eip155",
  reference: "1",
};

const FAKE_ADDRESS = "0xC0FFEE0000000000000000000000000000000000";
const FAKE_OIDC_ADDRESS = "0xDECAF00000000000000000000000000000000000";

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const buildAccount = (address: string): Account => ({
  chain: ETHEREUM_CHAIN,
  id: `evm:${address}`,
  walletAddress: address,
});

type ConnectorOptions = {
  address: string;
  delayMs: number;
  id: string;
  name: string;
  oidc: boolean;
};

const baseConnector = (opts: ConnectorOptions): UIConnector => {
  const { address, delayMs, id, name, oidc } = opts;
  let account: Account | null = null;

  return {
    authProvider: oidc ? "google" : undefined,
    chainPlatform: "evm" satisfies ChainPlatform,
    async connect() {
      await wait(delayMs);
      account = buildAccount(address);
    },
    disconnect() {
      account = null;
      return Promise.resolve();
    },
    getAccount() {
      return Promise.resolve(account);
    },
    getBalance(_mint?: string): Promise<Balance> {
      return Promise.resolve({
        decimals: 18,
        formatted: "1.0",
        symbol: "ETH",
        value: 1_000_000_000_000_000_000n,
      });
    },
    getSigner() {
      return Promise.resolve({ kind: "mock-signer" });
    },
    getTransactionReceipt() {
      return Promise.resolve({ status: "Success" as const });
    },
    id,
    isOIDCBased: oidc,
    name,
    requiresAuth: oidc,
    sendTx() {
      return Promise.resolve("0xmocktx");
    },
    sendTxToChain(_tx, _chainId, cb) {
      cb?.();
      return Promise.resolve("0xmocktx");
    },
    signIn(input: SignInInput) {
      const bytes = new TextEncoder().encode(input.statement ?? input.domain);
      return Promise.resolve({ signature: bytes, signedMessage: bytes });
    },
    signMessage(msg) {
      return Promise.resolve({ signature: msg, signedMessage: msg });
    },
    switchAccount(newAddress) {
      account = buildAccount(newAddress);
      return Promise.resolve();
    },
    switchChain(_chain) {
      return Promise.resolve();
    },
  };
};

const createMockEvmConnector = (): UIConnector =>
  baseConnector({
    address: FAKE_ADDRESS,
    delayMs: 500,
    id: "mock-evm",
    name: "Mock EVM Wallet",
    oidc: false,
  });

const createMockOIDCConnector = (): UIConnector =>
  baseConnector({
    address: FAKE_OIDC_ADDRESS,
    delayMs: 800,
    id: "mock-oidc",
    name: "Mock Google OIDC",
    oidc: true,
  });

const MOCK_CONNECTORS_META: Array<ConnectorMeta> = [
  { chainPlatform: "evm", id: "mock-evm", name: "Mock EVM Wallet" },
  { chainPlatform: "evm", id: "mock-oidc", name: "Mock Google OIDC" },
];

const createMockConnectorById = (id: string): UIConnector | null => {
  if (id === "mock-evm") {
    return createMockEvmConnector();
  }
  if (id === "mock-oidc") {
    return createMockOIDCConnector();
  }
  return null;
};

// Type-marker references so WalletMode and ChainPlatform stay used after
// removing the dummy export constants. Both are also referenced as types
// elsewhere in this file, but keeping these explicit makes the intent obvious.
const _typeMarkers: { mode: WalletMode; platforms: Array<ChainPlatform> } = {
  mode: "none",
  platforms: ["evm"],
};
void _typeMarkers;

export { MOCK_CONNECTORS_META, createMockConnectorById };
