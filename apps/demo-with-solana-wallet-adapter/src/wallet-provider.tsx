import type { ReactNode } from "react";
import { createWalletSource } from "@butr/core";
import { WalletManagerProvider, useDiscoveredWallets } from "@butr/react";
import { discoverSvmAdapters } from "@butr/svm";

// SVM-only: @butr/react + @butr/svm.
const svmDiscovery = createWalletSource(discoverSvmAdapters);

const WalletProvider = ({ children }: { children: ReactNode }) => (
  <WalletManagerProvider discovery={svmDiscovery} storageKeyPrefix="butr-solana-wallet-adapter-demo">
    {children}
  </WalletManagerProvider>
);

export { WalletProvider, useDiscoveredWallets };
