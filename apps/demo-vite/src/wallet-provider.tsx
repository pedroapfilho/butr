import type { ReactNode } from "react";
import { WalletManagerProvider } from "@butr/react";
import { autoDiscovery } from "@butr/wallets";

const discovery = autoDiscovery();

const WalletProvider = ({ children }: { children: ReactNode }) => (
  <WalletManagerProvider discovery={discovery} storageKeyPrefix="butr-demo">
    {children}
  </WalletManagerProvider>
);

export { WalletProvider };
