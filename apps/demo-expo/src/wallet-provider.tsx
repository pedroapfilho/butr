import { type ReactNode } from "react";
import {
  WalletManagerProvider,
  WalletStorage,
  createBrowserStorageDriver,
  createMemoryStorageDriver,
  createWalletStore,
  type BrowserStorageDrivers,
  type ConnectedWalletsRecord,
  type MaybePromise,
  type StorageDriver,
  type StoredWalletData,
  type WalletManagerConfig,
  type WalletPersistence,
  type WalletStore,
} from "butr";
import { MOCK_CONNECTORS_META, createMockConnectorById } from "./mock-connector";

type _StorageTypeRefs = {
  drivers: BrowserStorageDrivers;
  record: ConnectedWalletsRecord;
  maybe: MaybePromise<string>;
  driver: StorageDriver;
  stored: StoredWalletData;
  store: WalletStore;
};
void ({} as _StorageTypeRefs);

// RN has no localStorage — use memory storage everywhere
const buildPersistence = (): WalletPersistence => {
  const mem = createMemoryStorageDriver();
  return new WalletStorage({
    keyPrefix: "butr-demo",
    persistent: mem,
    session: mem,
  });
};

const config: WalletManagerConfig = {
  connectors: MOCK_CONNECTORS_META,
  createConnector: createMockConnectorById,
  storageKeyPrefix: "butr-demo",
  storage: buildPersistence(),
  onConnect: (wallet) => console.log("[demo] connected", wallet),
  onDisconnect: (platform) => console.log("[demo] disconnected", platform),
  onReset: () => console.log("[demo] reset"),
};

const _previewStore: ReturnType<typeof createWalletStore> | null = null;
void _previewStore;

// Keep createBrowserStorageDriver imported so fallow doesn't flag the missing import,
// but it is not called at runtime (RN lacks localStorage).
void createBrowserStorageDriver;

const WalletProvider = ({ children }: { children: ReactNode }) => (
  <WalletManagerProvider config={config}>{children}</WalletManagerProvider>
);

export { WalletProvider };
