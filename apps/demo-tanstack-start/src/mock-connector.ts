import type { Account, Balance, ChainBase, ChainPlatform, ConnectorMeta, UIConnector } from "butr";

const ETHEREUM_CHAIN: ChainBase = {
  id: "eip155:1",
  name: "Ethereum",
  namespace: "eip155",
  reference: "1",
};

const SOLANA_CHAIN: ChainBase = {
  id: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  name: "Solana",
  namespace: "solana",
  reference: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
};

const FAKE_EVM_ADDRESS = "0xC0FFEE0000000000000000000000000000000000";
const FAKE_SVM_ADDRESS = "MockS0LaNAAddre55F0rDem01111111111111111111";

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

type ConnectorOptions = {
  address: string;
  chain: ChainBase;
  chainPlatform: ChainPlatform;
  decimals: number;
  delayMs: number;
  id: string;
  name: string;
  symbol: string;
  unit: bigint;
};

const buildAccount = (address: string, chain: ChainBase): Account => ({
  chain,
  id: `${chain.namespace}:${address}`,
  walletAddress: address,
});

const baseConnector = (opts: ConnectorOptions): UIConnector => {
  const { address, chain, chainPlatform, decimals, delayMs, id, name, symbol, unit } = opts;
  let account: Account | null = null;

  return {
    chainPlatform,
    async connect() {
      await wait(delayMs);
      account = buildAccount(address, chain);
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
        decimals,
        formatted: "1.0",
        symbol,
        value: unit,
      });
    },
    getSigner() {
      return Promise.resolve({ kind: `mock-${chainPlatform}-signer` });
    },
    getTransactionReceipt() {
      return Promise.resolve({ status: "Success" as const });
    },
    id,
    name,
    sendTx() {
      return Promise.resolve("0xmocktx");
    },
    sendTxToChain(_tx, _chainId, cb) {
      cb?.();
      return Promise.resolve("0xmocktx");
    },
    signMessage(msg) {
      return Promise.resolve({ signature: msg, signedMessage: msg });
    },
    switchAccount(newAddress) {
      account = buildAccount(newAddress, chain);
      return Promise.resolve();
    },
    switchChain(_chain) {
      return Promise.resolve();
    },
  };
};

const createMockEvmConnector = (): UIConnector =>
  baseConnector({
    address: FAKE_EVM_ADDRESS,
    chain: ETHEREUM_CHAIN,
    chainPlatform: "evm",
    decimals: 18,
    delayMs: 500,
    id: "mock-evm",
    name: "Mock MetaMask",
    symbol: "ETH",
    unit: 1_000_000_000_000_000_000n,
  });

const createMockSvmConnector = (): UIConnector =>
  baseConnector({
    address: FAKE_SVM_ADDRESS,
    chain: SOLANA_CHAIN,
    chainPlatform: "svm",
    decimals: 9,
    delayMs: 600,
    id: "mock-svm",
    name: "Mock Phantom",
    symbol: "SOL",
    unit: 1_000_000_000n,
  });

const MOCK_CONNECTORS_META: Array<ConnectorMeta> = [
  { chainPlatform: "evm", id: "mock-evm", name: "Mock MetaMask" },
  { chainPlatform: "svm", id: "mock-svm", name: "Mock Phantom" },
];

const createMockConnectorById = (id: string): UIConnector | null => {
  if (id === "mock-evm") {
    return createMockEvmConnector();
  }
  if (id === "mock-svm") {
    return createMockSvmConnector();
  }
  return null;
};

export { MOCK_CONNECTORS_META, createMockConnectorById };
