import React, { createContext, use, useEffect, useMemo, useState } from "react";
import type { WalletAdapter, WalletManagerConfig } from "@butr/core";
import { WalletManagerProvider, useWalletStoreContext } from "@butr/react";
import { type DiscoverOptions, discoverWalletAdapters, resolveDiscoverOptions } from "./discover";

const EMPTY_DISCOVERED: ReadonlyArray<WalletAdapter> = [];
const DiscoveredWalletsContext: React.Context<ReadonlyArray<WalletAdapter>> = createContext<
  ReadonlyArray<WalletAdapter>
>(EMPTY_DISCOVERED);

type AutoWalletManagerProviderProps = {
  /** `true` (default) discovers every platform. Pass an options object
   *  to restrict to a single platform — e.g. `{ evm: true }`. */
  auto?: true | DiscoverOptions;
  children: React.ReactNode;
  onConnect?: WalletManagerConfig["onConnect"];
  onConnectError?: WalletManagerConfig["onConnectError"];
  onDisconnect?: WalletManagerConfig["onDisconnect"];
  onHydrated?: WalletManagerConfig["onHydrated"];
  onReset?: WalletManagerConfig["onReset"];
  onSlowConnect?: WalletManagerConfig["onSlowConnect"];
  onStorageError?: WalletManagerConfig["onStorageError"];
  slowConnectThresholdMs?: WalletManagerConfig["slowConnectThresholdMs"];
  storage?: WalletManagerConfig["storage"];
  storageKeyPrefix?: WalletManagerConfig["storageKeyPrefix"];
};

/**
 * Drives EIP-6963 / Wallet Standard discovery and forwards announced
 * adapters into the shared adapters Map. Lives inside the
 * `WalletManagerProvider` tree so it can read the store via context to
 * call `_tryRestoreFromPending` when a late-arriving adapter (e.g. SVM
 * via async `@wallet-standard/app` import) matches a stored pending
 * entry.
 */
const DiscoverySubscriber: React.FC<{
  adapters: Map<string, WalletAdapter>;
  options: DiscoverOptions | undefined;
  setDiscoveredList: React.Dispatch<React.SetStateAction<ReadonlyArray<WalletAdapter>>>;
}> = ({ adapters, options, setDiscoveredList }) => {
  const store = useWalletStoreContext();
  useEffect(() => {
    const unsubscribe = discoverWalletAdapters((adapter) => {
      if (adapters.has(adapter.id)) {
        return;
      }
      adapters.set(adapter.id, adapter);
      setDiscoveredList((prev) => [...prev, adapter]);
      void store.getState()._tryRestoreFromPending(adapter.id);
    }, options);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subscribe once on mount
  }, []);
  return null;
};

/**
 * Drop-in `<WalletManagerProvider>` replacement that wires butr's
 * EVM + SVM discovery automatically. Renders children inside a
 * `WalletManagerProvider` from `@butr/react` with a `createConnector`
 * closure backed by discovered adapters, plus a
 * `DiscoveredWalletsContext` that `useDiscoveredWallets()` reads.
 */
const AutoWalletManagerProvider: React.FC<AutoWalletManagerProviderProps> = ({
  auto,
  children,
  onConnect,
  onConnectError,
  onDisconnect,
  onHydrated,
  onReset,
  onSlowConnect,
  onStorageError,
  slowConnectThresholdMs,
  storage,
  storageKeyPrefix,
}) => {
  const [adapters] = useState<Map<string, WalletAdapter>>(() => new Map());
  const [discoveredList, setDiscoveredList] =
    useState<ReadonlyArray<WalletAdapter>>(EMPTY_DISCOVERED);

  const resolved = resolveDiscoverOptions(auto ?? true);
  const discoverOptions: DiscoverOptions | undefined = resolved.active
    ? { evm: resolved.evm, svm: resolved.svm }
    : undefined;

  // eslint-disable-next-line react-hooks/exhaustive-deps -- captured once on mount
  const config = useMemo<WalletManagerConfig>(
    () => ({
      connectors: [],
      createConnector: (id) => adapters.get(id) ?? null,
      onConnect,
      onConnectError,
      onDisconnect,
      onHydrated,
      onReset,
      onSlowConnect,
      onStorageError,
      slowConnectThresholdMs,
      storage,
      storageKeyPrefix,
    }),
    [],
  );

  return (
    <WalletManagerProvider config={config}>
      <DiscoverySubscriber
        adapters={adapters}
        options={discoverOptions}
        setDiscoveredList={setDiscoveredList}
      />
      <DiscoveredWalletsContext.Provider value={discoveredList}>
        {children}
      </DiscoveredWalletsContext.Provider>
    </WalletManagerProvider>
  );
};

/**
 * Reactive list of wallets that have announced themselves via EIP-6963
 * or Wallet Standard since the provider mounted.
 */
const useDiscoveredWallets = (): ReadonlyArray<WalletAdapter> => use(DiscoveredWalletsContext);

export type { AutoWalletManagerProviderProps };
export { AutoWalletManagerProvider, useDiscoveredWallets };
