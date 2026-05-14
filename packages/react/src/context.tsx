import React, { createContext, use, useEffect, useMemo, useRef, useState } from "react";
import type { WalletManagerConfig } from "@butr/core";
import { type WalletStore, createWalletStore } from "@butr/core";

const WalletStoreContext: React.Context<WalletStore | null> = createContext<WalletStore | null>(null);

type WalletManagerProviderProps = {
  children: React.ReactNode;
  config: WalletManagerConfig;
};

/**
 * The manual butr provider. Wire every connector yourself via
 * `config.connectors` and `config.createConnector`.
 *
 * For auto-discovery, use `<AutoWalletManagerProvider>` from
 * `@butr/wallets` — it composes EVM + SVM discovery and renders this
 * provider with a discovery-backed `createConnector` closure.
 *
 * The store is created exactly once for the lifetime of the provider;
 * the `config` argument captured at mount is the one used for the
 * store's entire lifecycle.
 */
const WalletManagerProvider: React.FC<WalletManagerProviderProps> = ({ children, config }) => {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- captured once on mount
  const initialConfig = useMemo<WalletManagerConfig>(() => config, []);
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

  return <WalletStoreContext.Provider value={store}>{children}</WalletStoreContext.Provider>;
};

/** Read the store from context. Exported for `@butr/wallets` (and adapter
 *  packages building their own custom provider). */
const useWalletStoreContext = (): WalletStore => {
  const store = use(WalletStoreContext);
  if (!store) {
    throw new Error("useWalletStoreContext must be used within WalletManagerProvider");
  }
  return store;
};

export type { WalletManagerProviderProps };
export { WalletManagerProvider, WalletStoreContext, useWalletStoreContext };
