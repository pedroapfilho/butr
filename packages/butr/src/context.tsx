import React, { createContext, use, useEffect, useState } from "react";
import type { WalletAdapter, WalletManagerConfig } from "@butr/core";
import {
  WalletManagerProvider as BaseWalletManagerProvider,
  useWalletStoreContext,
} from "@butr/react";
import {
  type DiscoverOptions,
  discoverWalletAdapters,
  resolveDiscoverOptions,
} from "./auto/discover";

const EMPTY_DISCOVERED: ReadonlyArray<WalletAdapter> = [];
const DiscoveredWalletsContext = createContext<ReadonlyArray<WalletAdapter>>(EMPTY_DISCOVERED);

/**
 * Auto-mode subset of `WalletManagerConfig`. When `auto` is set, butr
 * builds `connectors` + `createConnector` internally from discovery,
 * so consumers only supply the optional callbacks/storage.
 *
 * The `auto` prop accepts either:
 *  - `true` — discover every platform butr knows how to discover
 *    (EVM via EIP-6963 + SVM via Wallet Standard).
 *  - An options object like `{ evm: true, svm: false }` to scope to a
 *    single platform.
 */
type AutoProviderProps = {
  auto: true | DiscoverOptions;
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

type ManualProviderProps = {
  auto?: false;
  children: React.ReactNode;
  config: WalletManagerConfig;
};

type WalletManagerProviderProps = AutoProviderProps | ManualProviderProps;

/**
 * Drives EIP-6963 / Wallet Standard discovery and forwards announced
 * adapters into the shared adapters Map. Lives inside the
 * `BaseWalletManagerProvider` tree so it can read the store via context
 * to call `_tryRestoreFromPending` when a late-arriving adapter (e.g.
 * SVM via async `@wallet-standard/app` import) matches a stored pending
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
 * Backwards-compatible butr provider. In manual mode it's a pass-through
 * to `@butr/react`'s `WalletManagerProvider`. In auto mode it wires the
 * discovery layer + `useDiscoveredWallets` context on top, while
 * delegating store ownership to `@butr/react`.
 *
 * This is a compatibility shim — `@butr/wallets` will provide a clean
 * `AutoWalletManagerProvider` API in a follow-up migration step.
 */
const WalletManagerProvider: React.FC<WalletManagerProviderProps> = (props) => {
  if (!props.auto) {
    return (
      <BaseWalletManagerProvider config={props.config}>{props.children}</BaseWalletManagerProvider>
    );
  }

  return <AutoModeProvider {...props} />;
};

const AutoModeProvider: React.FC<AutoProviderProps> = (props) => {
  const [adapters] = useState<Map<string, WalletAdapter>>(() => new Map());
  const [discoveredList, setDiscoveredList] =
    useState<ReadonlyArray<WalletAdapter>>(EMPTY_DISCOVERED);

  const resolvedAuto = resolveDiscoverOptions(props.auto);
  const discoverOptions: DiscoverOptions | undefined = resolvedAuto.active
    ? { evm: resolvedAuto.evm, svm: resolvedAuto.svm }
    : undefined;

  // Stable config object for the lifetime of the provider. `connectors`
  // stays empty (discovery is reactive — UI reads via
  // `useDiscoveredWallets`) and `createConnector` closes over the
  // adapters Map so it always sees the latest announcements.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- captured once on mount
  const initialConfig: WalletManagerConfig = {
    connectors: [],
    createConnector: (id) => adapters.get(id) ?? null,
    onConnect: props.onConnect,
    onConnectError: props.onConnectError,
    onDisconnect: props.onDisconnect,
    onHydrated: props.onHydrated,
    onReset: props.onReset,
    onSlowConnect: props.onSlowConnect,
    onStorageError: props.onStorageError,
    slowConnectThresholdMs: props.slowConnectThresholdMs,
    storage: props.storage,
    storageKeyPrefix: props.storageKeyPrefix,
  };

  return (
    <BaseWalletManagerProvider config={initialConfig}>
      <DiscoverySubscriber
        adapters={adapters}
        options={discoverOptions}
        setDiscoveredList={setDiscoveredList}
      />
      <DiscoveredWalletsContext.Provider value={discoveredList}>
        {props.children}
      </DiscoveredWalletsContext.Provider>
    </BaseWalletManagerProvider>
  );
};

/**
 * Reactive list of wallets that have announced themselves via EIP-6963
 * (or Wallet Standard) since the provider mounted. Returns an empty
 * array in manual mode — auto-discovery is opt-in via the `auto` prop.
 */
const useDiscoveredWallets = (): ReadonlyArray<WalletAdapter> => use(DiscoveredWalletsContext);

export type { AutoProviderProps, ManualProviderProps, WalletManagerProviderProps };
export { WalletManagerProvider, useDiscoveredWallets, useWalletStoreContext };
