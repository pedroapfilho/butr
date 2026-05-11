import { vi } from "vitest";
import type {
  Account,
  ChainBase,
  ChainPlatform,
  WalletAdapter,
  WalletManagerConfig,
} from "../types";
import type { StorageDriver } from "../storage/persistence";

const createMockChain = (overrides?: Partial<ChainBase>): ChainBase => ({
  id: "eip155:1",
  name: "Ethereum",
  namespace: "eip155",
  reference: "1",
  ...overrides,
});

const createMockAccount = (overrides?: Partial<Account>): Account => ({
  chain: createMockChain(),
  id: "mock-account-id",
  walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
  ...overrides,
});

const createMockConnector = (overrides?: Partial<WalletAdapter>): WalletAdapter => ({
  chainPlatform: "evm" as ChainPlatform,
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  getAccount: vi.fn().mockResolvedValue(createMockAccount()),
  getBalance: vi.fn().mockResolvedValue({
    decimals: 18,
    formatted: "0",
    symbol: "ETH",
    value: 0n,
  }),
  getSigner: vi.fn().mockResolvedValue({}),
  getTransactionReceipt: vi.fn().mockResolvedValue({ status: "Success" as const }),
  id: "mock-connector",
  name: "Mock Wallet",
  sendTx: vi.fn().mockResolvedValue("0xtxhash"),
  sendTxToChain: vi.fn().mockResolvedValue("0xtxhash"),
  signMessage: vi.fn().mockResolvedValue(new Uint8Array()),
  switchChain: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const createMockStorageDriver = (): StorageDriver => {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
  };
};

/** Returns an async driver backed by a Map. Each call defers via
 *  Promise.resolve to simulate AsyncStorage-like behavior. */
const createAsyncMockStorageDriver = (): StorageDriver => {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
  };
};

const createMockStoragePair = () => ({
  persistent: createMockStorageDriver(),
  session: createMockStorageDriver(),
});

const createMockConfig = (overrides?: Partial<WalletManagerConfig>): WalletManagerConfig => ({
  connectors: [],
  // Honor the requested connector id so the pool keys (entry.connector.id) match
  // the argument passed to connectWallet. Tests that need a specific connector
  // shape pass `createConnector` in `overrides`.
  createConnector: vi.fn((id: string) => createMockConnector({ id })),
  ...overrides,
});

export {
  createAsyncMockStorageDriver,
  createMockAccount,
  createMockChain,
  createMockConfig,
  createMockConnector,
  createMockStorageDriver,
  createMockStoragePair,
};
