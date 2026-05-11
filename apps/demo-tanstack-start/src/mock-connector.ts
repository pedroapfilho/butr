import type {
  Account,
  Balance,
  ChainBase,
  ChainPlatform,
  ConnectorEvent,
  ConnectorMeta,
  WalletAdapter,
} from "butr";

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
const FAKE_EVM_ADDRESS_ALT = "0xDECAF00000000000000000000000000000000000";
const FAKE_SVM_ADDRESS = "MockS0LaNAAddre55F0rDem01111111111111111111";
const FAKE_SVM_ADDRESS_ALT = "MockS0LaNAAddre55Alternate0000000000000000";

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

type ConnectorOptions = {
  altAddress: string;
  chain: ChainBase;
  chainPlatform: ChainPlatform;
  decimals: number;
  delayMs: number;
  id: string;
  mainAddress: string;
  name: string;
  symbol: string;
  unit: bigint;
};

const buildAccount = (address: string, chain: ChainBase): Account => ({
  chain,
  id: `${chain.namespace}:${address}`,
  walletAddress: address,
});

/**
 * Lets the demo trigger wallet-side events on a mock connector
 * (account swap, external disconnect) so the subscription bridge
 * can be exercised from the UI.
 */
type MockConnectorHandle = WalletAdapter & {
  __emit: (event: ConnectorEvent) => void;
};

const baseConnector = (opts: ConnectorOptions): MockConnectorHandle => {
  const {
    altAddress,
    chain,
    chainPlatform,
    decimals,
    delayMs,
    id,
    mainAddress,
    name,
    symbol,
    unit,
  } = opts;
  let account: Account | null = null;
  const knownAccounts: Array<Account> = [
    buildAccount(mainAddress, chain),
    buildAccount(altAddress, chain),
  ];
  const listeners = new Set<(event: ConnectorEvent) => void>();

  const connector: MockConnectorHandle = {
    __emit(event) {
      for (const l of listeners) {
        l(event);
      }
    },
    chainPlatform,
    async connect() {
      await wait(delayMs);
      account = knownAccounts[0] ?? null;
    },
    disconnect() {
      account = null;
      return Promise.resolve();
    },
    getAccount() {
      return Promise.resolve(account);
    },
    getAccounts() {
      return Promise.resolve([...knownAccounts]);
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
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    switchAccount(newAddress) {
      account = buildAccount(newAddress, chain);
      return Promise.resolve();
    },
    switchChain(_chain) {
      return Promise.resolve();
    },
  };

  return connector;
};

// Hold onto the connector instance so the UI can call __emit() and
// trigger wallet-side events. butr's runtime calls createConnector once
// per `connect()` flow; we cache by id so subsequent emits target the
// instance butr is actually subscribed to.
const cache = new Map<string, MockConnectorHandle>();

const createMockEvmConnector = (): MockConnectorHandle => {
  const cached = cache.get("mock-evm");
  if (cached) {
    return cached;
  }
  const c = baseConnector({
    altAddress: FAKE_EVM_ADDRESS_ALT,
    chain: ETHEREUM_CHAIN,
    chainPlatform: "evm",
    decimals: 18,
    delayMs: 500,
    id: "mock-evm",
    mainAddress: FAKE_EVM_ADDRESS,
    name: "Mock MetaMask",
    symbol: "ETH",
    unit: 1_000_000_000_000_000_000n,
  });
  cache.set("mock-evm", c);
  return c;
};

const createMockSvmConnector = (): MockConnectorHandle => {
  const cached = cache.get("mock-svm");
  if (cached) {
    return cached;
  }
  const c = baseConnector({
    altAddress: FAKE_SVM_ADDRESS_ALT,
    chain: SOLANA_CHAIN,
    chainPlatform: "svm",
    decimals: 9,
    delayMs: 600,
    id: "mock-svm",
    mainAddress: FAKE_SVM_ADDRESS,
    name: "Mock Phantom",
    symbol: "SOL",
    unit: 1_000_000_000n,
  });
  cache.set("mock-svm", c);
  return c;
};

const MOCK_CONNECTORS_META: Array<ConnectorMeta> = [
  {
    availability: () => "installed",
    chainPlatform: "evm",
    icon: "https://placehold.co/24x24?text=M",
    id: "mock-evm",
    name: "Mock MetaMask",
    url: "https://metamask.io/download",
  },
  {
    availability: () => "installed",
    chainPlatform: "svm",
    icon: "https://placehold.co/24x24?text=P",
    id: "mock-svm",
    name: "Mock Phantom",
    url: "https://phantom.app/download",
  },
];

const createMockConnectorById = (id: string): WalletAdapter | null => {
  if (id === "mock-evm") {
    return createMockEvmConnector();
  }
  if (id === "mock-svm") {
    return createMockSvmConnector();
  }
  return null;
};

const getMockConnectorHandle = (id: string): MockConnectorHandle | null => {
  if (id === "mock-evm") {
    return createMockEvmConnector();
  }
  if (id === "mock-svm") {
    return createMockSvmConnector();
  }
  return null;
};

export type { MockConnectorHandle };
export { MOCK_CONNECTORS_META, createMockConnectorById, getMockConnectorHandle };
