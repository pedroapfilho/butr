import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import type { WalletManagerConfig } from "./types";
import { type WalletStore, createWalletStore } from "./store";

const WalletStoreContext = createContext<WalletStore | null>(null);

type WalletManagerProviderProps = {
  children: React.ReactNode;
  config: WalletManagerConfig;
};

const WalletManagerProvider: React.FC<WalletManagerProviderProps> = ({ children, config }) => {
  const [store] = useState(() => createWalletStore(config));
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

/** Hook to get the store from context (internal) */
const useWalletStoreContext = () => {
  const store = useContext(WalletStoreContext);
  if (!store) {
    throw new Error("useWalletStoreContext must be used within WalletManagerProvider");
  }
  return store;
};

export { WalletManagerProvider, useWalletStoreContext };
