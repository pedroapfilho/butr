import type { ReactNode } from "react";
import { WalletStorage } from "@butr/core";
import { WalletManagerProvider } from "@butr/react";
import { autoDiscovery } from "@butr/wallets";
import { asyncStorageDriver } from "./async-storage-driver";

const KEY_PREFIX = "butr-demo";

const discovery = autoDiscovery();

const storage = new WalletStorage({
  keyPrefix: KEY_PREFIX,
  persistent: asyncStorageDriver,
  session: asyncStorageDriver,
});

const WalletProvider = ({ children }: { children: ReactNode }) => (
  <WalletManagerProvider
    discovery={discovery}
    storage={storage}
    storageKeyPrefix={KEY_PREFIX}
  >
    {children}
  </WalletManagerProvider>
);

export { WalletProvider };
