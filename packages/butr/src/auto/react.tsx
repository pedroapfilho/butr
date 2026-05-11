import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { WalletManagerProvider } from "../context";
import type { WalletAdapter, WalletManagerConfig } from "../types";
import { discoverWalletAdapters } from "./discover";

const EMPTY: ReadonlyArray<WalletAdapter> = [];

const DiscoveredWalletsContext = createContext<ReadonlyArray<WalletAdapter>>(EMPTY);

type AutoWalletManagerProviderProps = {
  children: React.ReactNode;
  /** Same callbacks `WalletManagerConfig` accepts. The auto provider
   *  builds the rest of the config (connectors + createConnector) from
   *  discovery results. */
  onConnect?: WalletManagerConfig["onConnect"];
  onDisconnect?: WalletManagerConfig["onDisconnect"];
  onReset?: WalletManagerConfig["onReset"];
  storage?: WalletManagerConfig["storage"];
  storageKeyPrefix?: WalletManagerConfig["storageKeyPrefix"];
};

/**
 * Drop-in alternative to `WalletManagerProvider` that wires up
 * EIP-6963 + Wallet Standard discovery and feeds the announced wallets
 * to butr's runtime automatically. Consumers don't define
 * `connectors` or `createConnector` themselves.
 *
 * Use `useDiscoveredWallets()` below the provider to render a wallet
 * picker — the list grows as wallets announce themselves.
 *
 * Internals:
 *
 *  - Adapters live in a `useRef` Map so `createConnector` can read them
 *    at connect-time (not at provider-mount-time). The Zustand store
 *    is created once with a stable closure that reads from the ref —
 *    new discoveries don't recreate the store.
 *  - A parallel React state holds the same adapters in array form so
 *    `useDiscoveredWallets()` re-renders when new wallets announce.
 */
const AutoWalletManagerProvider: React.FC<AutoWalletManagerProviderProps> = ({
  children,
  onConnect,
  onDisconnect,
  onReset,
  storage,
  storageKeyPrefix,
}) => {
  const adaptersRef = useRef<Map<string, WalletAdapter>>(new Map());
  const [adapterList, setAdapterList] = useState<ReadonlyArray<WalletAdapter>>(EMPTY);

  // Stable config — `createConnector` is a closure over `adaptersRef`,
  // never a stale snapshot. butr's runtime calls it at connect-time, so
  // a wallet announced after mount is still findable when the user
  // clicks "Connect".
  const config = useMemo<WalletManagerConfig>(
    () => ({
      // Discovery is reactive — consumers read the live list via
      // `useDiscoveredWallets`, so the static `connectors` array
      // intentionally stays empty.
      connectors: [],
      createConnector: (id) => adaptersRef.current.get(id) ?? null,
      onConnect,
      onDisconnect,
      onReset,
      storage,
      storageKeyPrefix,
    }),
    [onConnect, onDisconnect, onReset, storage, storageKeyPrefix],
  );

  useEffect(() => {
    const unsubscribe = discoverWalletAdapters((adapter) => {
      if (adaptersRef.current.has(adapter.id)) {
        return;
      }
      adaptersRef.current.set(adapter.id, adapter);
      setAdapterList((prev) => [...prev, adapter]);
    });
    return unsubscribe;
  }, []);

  return (
    <DiscoveredWalletsContext.Provider value={adapterList}>
      <WalletManagerProvider config={config}>{children}</WalletManagerProvider>
    </DiscoveredWalletsContext.Provider>
  );
};

/**
 * Reactive list of wallets that have announced themselves via EIP-6963
 * or Wallet Standard since the provider mounted. Re-renders when new
 * wallets are discovered.
 *
 * Each entry is a complete `WalletAdapter` — consumers pass its `id`
 * to `useConnectWallet()` to actually connect.
 */
const useDiscoveredWallets = (): ReadonlyArray<WalletAdapter> =>
  useContext(DiscoveredWalletsContext);

export type { AutoWalletManagerProviderProps };
export { AutoWalletManagerProvider, useDiscoveredWallets };
