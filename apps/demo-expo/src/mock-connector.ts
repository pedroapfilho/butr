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
  namespace: "eip155",
  reference: "1",
  name: "Ethereum",
};

const FAKE_ADDRESS = "0xC0FFEE0000000000000000000000000000000000";
const FAKE_OIDC_ADDRESS = "0xDECAF00000000000000000000000000000000000";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const buildAccount = (address: string): Account => ({
  chain: ETHEREUM_CHAIN,
  walletAddress: address,
  id: `evm:${address}`,
});

const baseConnector = (
  id: string,
  name: string,
  address: string,
  delayMs: number,
  oidc: boolean,
): UIConnector => {
  let account: Account | null = null;

  return {
    id,
    name,
    chainPlatform: "evm" satisfies ChainPlatform,
    isOIDCBased: oidc,
    authProvider: oidc ? "google" : undefined,
    requiresAuth: oidc,

    async connect() {
      await wait(delayMs);
      account = buildAccount(address);
    },
    async disconnect() {
      account = null;
    },
    async getAccount() {
      return account;
    },
    async switchAccount(newAddress) {
      account = buildAccount(newAddress);
    },
    async switchChain(_chain) {},
    async getSigner() {
      return { kind: "mock-signer" };
    },
    async signMessage(msg) {
      return { signature: msg, signedMessage: msg };
    },
    async signIn(input: SignInInput) {
      const bytes = new TextEncoder().encode(input.statement ?? input.domain);
      return { signature: bytes, signedMessage: bytes };
    },
    async sendTx() {
      return "0xmocktx";
    },
    async sendTxToChain(_tx, _chainId, cb) {
      cb?.();
      return "0xmocktx";
    },
    async getTransactionReceipt() {
      return { status: "Success" as const };
    },
    async getBalance(_mint?: string): Promise<Balance> {
      return {
        value: 1_000_000_000_000_000_000n,
        decimals: 18,
        symbol: "ETH",
        formatted: "1.0",
      };
    },
  };
};

const createMockEvmConnector = (): UIConnector =>
  baseConnector("mock-evm", "Mock EVM Wallet", FAKE_ADDRESS, 500, false);

const createMockOIDCConnector = (): UIConnector =>
  baseConnector("mock-oidc", "Mock Google OIDC", FAKE_OIDC_ADDRESS, 800, true);

const MOCK_CONNECTORS_META: ConnectorMeta[] = [
  { id: "mock-evm", name: "Mock EVM Wallet", chainPlatform: "evm" },
  { id: "mock-oidc", name: "Mock Google OIDC", chainPlatform: "evm" },
];

const createMockConnectorById = (id: string): UIConnector | null => {
  if (id === "mock-evm") return createMockEvmConnector();
  if (id === "mock-oidc") return createMockOIDCConnector();
  return null;
};

const SUPPORTED_PLATFORMS: ChainPlatform[] = ["evm"];
const INITIAL_MODE: WalletMode = "none";

export {
  INITIAL_MODE,
  MOCK_CONNECTORS_META,
  SUPPORTED_PLATFORMS,
  createMockConnectorById,
  createMockEvmConnector,
  createMockOIDCConnector,
};
