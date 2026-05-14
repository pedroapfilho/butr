import type { ReactNode } from "react";
import { AutoWalletManagerProvider } from "@butr/wallets";

// TODO(remove after multi-platform restore is verified): the onHydrated /
// onConnect / onStorageError logs answer "what did butr actually do at reload
// time?" — `restoredIds` shows eager restores, `pendingIds` shows wallets
// whose adapter announced after hydration, and `onConnect` confirms each
// late-restore via _tryRestoreFromPending. Inspect localStorage's
// `butr-demo-pool` key alongside to see what was persisted.
const logHydrated: React.ComponentProps<typeof AutoWalletManagerProvider>["onHydrated"] = (
  outcome,
) => {
  console.log("[butr-demo] onHydrated", outcome);
};

const logConnect: React.ComponentProps<typeof AutoWalletManagerProvider>["onConnect"] = (
  wallet,
) => {
  console.log("[butr-demo] onConnect", {
    id: wallet.connector.id,
    chain: wallet.account.chain.id,
  });
};

const logStorageError: React.ComponentProps<
  typeof AutoWalletManagerProvider
>["onStorageError"] = (error, context) => {
  console.warn("[butr-demo] onStorageError", context, error);
};

const logDisconnect: React.ComponentProps<typeof AutoWalletManagerProvider>["onDisconnect"] = (
  chainPlatform,
) => {
  console.log("[butr-demo] onDisconnect", { chainPlatform });
};

const WalletProvider = ({ children }: { children: ReactNode }) => (
  <AutoWalletManagerProvider
    onConnect={logConnect}
    onDisconnect={logDisconnect}
    onHydrated={logHydrated}
    onStorageError={logStorageError}
    storageKeyPrefix="butr-demo"
  >
    {children}
  </AutoWalletManagerProvider>
);

export { WalletProvider };
