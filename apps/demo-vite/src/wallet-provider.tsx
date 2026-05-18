import type { ReactNode } from "react";
import { WalletManagerProvider } from "@butr/react";
import { autoDiscovery } from "@butr/wallets";

const WalletProvider = ({ children }: { children: ReactNode }) => (
  <WalletManagerProvider discovery={autoDiscovery()} storageKeyPrefix="butr-demo">
    {children}
  </WalletManagerProvider>
);

export { WalletProvider };
