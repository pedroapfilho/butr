import type { ReactNode } from "react";
import { createWalletSource } from "@butr/core";
import { WalletManagerProvider, useDiscoveredWallets } from "@butr/react";
import { discoverEvmAdapters } from "@butr/evm";

// EVM-only: @butr/react + @butr/evm. No @butr/svm / @butr/wallets in the
// bundle — discovery is a WalletSource built from the EVM discoverer.
const evmDiscovery = createWalletSource(discoverEvmAdapters);

const WalletProvider = ({ children }: { children: ReactNode }) => (
  <WalletManagerProvider discovery={evmDiscovery} storageKeyPrefix="butr-demo">
    {children}
  </WalletManagerProvider>
);

export { WalletProvider, useDiscoveredWallets };
