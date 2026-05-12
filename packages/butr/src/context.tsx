import React, { createContext, use, useEffect, useMemo, useRef, useState } from "react";
import { type DiscoverOptions, discoverWalletAdapters } from "./auto/discover";
import type { WalletAdapter, WalletManagerConfig } from "./types";
import { type WalletStore, createWalletStore } from "./store";

const WalletStoreContext = createContext<WalletStore | null>(null);
const EMPTY_DISCOVERED: ReadonlyArray<WalletAdapter> = [];
const DiscoveredWalletsContext = createContext<ReadonlyArray<WalletAdapter>>(EMPTY_DISCOVERED);

/**
 * Auto-mode subset of `WalletManagerConfig`. When `auto` is set, butr
 * builds `connectors` + `createConnector` internally from discovery,
 * so consumers only supply the optional callbacks/storage.
 *
 * The `auto` prop accepts either:
 *  - `true` — discover every platform butr knows how to discover
 *    (EVM via EIP-6963 + SVM via Wallet Standard). The SVM side
 *    silently no-ops if `@wallet-standard/app` isn't installed.
 *  - An options object like `{ evm: true, svm: false }` to scope to a
 *    single platform. Useful for apps that only target one chain
 *    family and don't want the other family's wallets cluttering
 *    `useDiscoveredWallets()`.
 */
type AutoProviderProps = {
  auto: true | DiscoverOptions;
  children: React.ReactNode;
  onConnect?: WalletManagerConfig["onConnect"];
  onConnectError?: WalletManagerConfig["onConnectError"];
  onDisconnect?: WalletManagerConfig["onDisconnect"];
  onReset?: WalletManagerConfig["onReset"];
  onSlowConnect?: WalletManagerConfig["onSlowConnect"];
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
 * The single butr provider. Two modes, picked by the `auto` prop:
 *
 *  - Manual (default): `<WalletManagerProvider config={...}>`. You wire
 *    every connector yourself via `config.connectors` and
 *    `config.createConnector`.
 *
 *  - Auto: `<WalletManagerProvider auto>`. butr subscribes to EIP-6963
 *    (and Wallet Standard, currently stubbed) and feeds the announced
 *    wallets to the store. No `config` is needed; callbacks/storage
 *    pass through as top-level props. Below the provider,
 *    `useDiscoveredWallets()` returns the live list for rendering a
 *    wallet picker.
 *
 * The store is created exactly once for the lifetime of the provider.
 * In auto mode, discovered adapters live in a `useRef` Map so the
 * store's `createConnector` closure reads them fresh at connect-time —
 * adapters announced after mount are still findable when the user
 * picks them.
 */
const WalletManagerProvider: React.FC<WalletManagerProviderProps> = (props) => {
  // Stable mutable Map for discovered adapters. `useState`'s initial-
  // value form computes the Map once on mount, and the reference is
  // shared across renders. We mutate the Map in place during discovery
  // (intentional — pool changes flow through the parallel
  // `discoveredList` state below, not through a Map identity change).
  // Using state instead of `useRef` here side-steps the
  // "no ref access during render" lint without changing behaviour.
  const [adapters] = useState<Map<string, WalletAdapter>>(() => new Map());
  const [discoveredList, setDiscoveredList] =
    useState<ReadonlyArray<WalletAdapter>>(EMPTY_DISCOVERED);

  // Stable config object for the lifetime of the provider. In auto
  // mode it carries empty `connectors` (discovery is reactive — UI
  // reads via `useDiscoveredWallets`) and a `createConnector` closure
  // over the adapters Map. In manual mode it's the passed config.
  const initialConfig = useMemo<WalletManagerConfig>(
    () => {
      if (props.auto) {
        return {
          connectors: [],
          createConnector: (id) => adapters.get(id) ?? null,
          onConnect: props.onConnect,
          onConnectError: props.onConnectError,
          onDisconnect: props.onDisconnect,
          onReset: props.onReset,
          onSlowConnect: props.onSlowConnect,
          slowConnectThresholdMs: props.slowConnectThresholdMs,
          storage: props.storage,
          storageKeyPrefix: props.storageKeyPrefix,
        };
      }
      return props.config;
    },
    // Intentional empty deps: the store is created once on mount and
    // never re-created. Callbacks captured at mount time are the only
    // ones the runtime will ever fire. Consumers who need late-bound
    // callbacks can wrap them in refs themselves. This matches the
    // pre-`auto` behaviour, where `config` was treated as static after
    // the first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [store] = useState(() => createWalletStore(initialConfig));
  const hasHydratedRef = useRef(false);

  useEffect(() => {
    if (hasHydratedRef.current) {
      return;
    }
    hasHydratedRef.current = true;

    const state = store.getState();
    void (async () => {
      try {
        await state._hydrateWallets();
      } catch (error: unknown) {
        console.error("[butr] failed to hydrate wallets:", error);
      }
    })();
  }, [store]);

  // Auto-discovery subscription. Only attaches when `auto` is set on
  // mount — toggling `auto` after mount is not supported (the store
  // was already built around the initial mode).
  //
  // `auto: true` enables both platforms. `auto: { evm?, svm? }` scopes
  // to whichever flags are set. The defaults inside `discoverWallet-
  // Adapters` mirror `true` when omitted, so `{ evm: true }` means
  // "EVM only" (svm defaults to its individual default — see
  // discover.ts).
  const isAuto = props.auto !== undefined && props.auto !== false;
  const discoverOptions: DiscoverOptions | undefined =
    typeof props.auto === "object" ? props.auto : undefined;
  useEffect(() => {
    if (!isAuto) {
      return;
    }
    const unsubscribe = discoverWalletAdapters((adapter) => {
      if (adapters.has(adapter.id)) {
        return;
      }
      adapters.set(adapter.id, adapter);
      setDiscoveredList((prev) => [...prev, adapter]);
      // If the user had this wallet connected last session but
      // hydration ran before the adapter was registered (Wallet
      // Standard's `@wallet-standard/app` import is async, so SVM
      // wallets miss the initial sweep), restore the pool entry now.
      void store.getState()._tryRestoreFromPending(adapter.id);
    }, discoverOptions);
    return unsubscribe;
  }, [adapters, discoverOptions, isAuto, store]);

  return (
    <WalletStoreContext.Provider value={store}>
      <DiscoveredWalletsContext.Provider value={discoveredList}>
        {props.children}
      </DiscoveredWalletsContext.Provider>
    </WalletStoreContext.Provider>
  );
};

/** Hook to get the store from context (internal) */
const useWalletStoreContext = () => {
  const store = use(WalletStoreContext);
  if (!store) {
    throw new Error("useWalletStoreContext must be used within WalletManagerProvider");
  }
  return store;
};

/**
 * Reactive list of wallets that have announced themselves via EIP-6963
 * (or Wallet Standard, when wired) since the provider mounted. Returns
 * an empty array in manual mode — auto-discovery is opt-in via the
 * `auto` prop on `WalletManagerProvider`.
 */
const useDiscoveredWallets = (): ReadonlyArray<WalletAdapter> => use(DiscoveredWalletsContext);

export type { AutoProviderProps, ManualProviderProps, WalletManagerProviderProps };
export { WalletManagerProvider, useDiscoveredWallets, useWalletStoreContext };
