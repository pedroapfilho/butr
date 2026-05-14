import {
  createContext,
  use,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { WalletAdapter, WalletManagerConfig } from "@butr/core";
import { WalletManagerProvider, useWalletStoreContext } from "@butr/react";
import { discoverEvmAdapters } from "@butr/evm";

// EVM-only manual wiring. Mirrors the demo-next pattern so the integration
// demos all share a clean "butr handles the connection, the integration lib
// handles the chain" boundary.

const EMPTY_DISCOVERED: ReadonlyArray<WalletAdapter> = [];
const DiscoveredEvmWalletsContext = createContext<ReadonlyArray<WalletAdapter>>(EMPTY_DISCOVERED);

const DiscoverySubscriber = ({
  adapters,
  setDiscoveredList,
}: {
  adapters: Map<string, WalletAdapter>;
  setDiscoveredList: (next: (prev: ReadonlyArray<WalletAdapter>) => ReadonlyArray<WalletAdapter>) => void;
}) => {
  const store = useWalletStoreContext();
  useEffect(() => {
    const unsubscribe = discoverEvmAdapters((adapter) => {
      if (adapters.has(adapter.id)) {
        return;
      }
      adapters.set(adapter.id, adapter);
      setDiscoveredList((prev) => [...prev, adapter]);
      void store.getState()._tryRestoreFromPending(adapter.id);
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};

const WalletProvider = ({ children }: { children: ReactNode }) => {
  const [adapters] = useState<Map<string, WalletAdapter>>(() => new Map());
  const [discoveredList, setDiscoveredList] =
    useState<ReadonlyArray<WalletAdapter>>(EMPTY_DISCOVERED);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const config = useMemo<WalletManagerConfig>(
    () => ({
      connectors: [],
      createConnector: (id) => adapters.get(id) ?? null,
      storageKeyPrefix: "butr-viem-demo",
    }),
    [],
  );

  return (
    <WalletManagerProvider config={config}>
      <DiscoverySubscriber adapters={adapters} setDiscoveredList={setDiscoveredList} />
      <DiscoveredEvmWalletsContext.Provider value={discoveredList}>
        {children}
      </DiscoveredEvmWalletsContext.Provider>
    </WalletManagerProvider>
  );
};

const useDiscoveredWallets = (): ReadonlyArray<WalletAdapter> =>
  use(DiscoveredEvmWalletsContext);

export { WalletProvider, useDiscoveredWallets };
