"use client";

import { useGetConnectorInstance, useWalletStore, type WalletStoreState } from "butr";

const pickSnapshot = (state: WalletStoreState) => ({
  activeConnectorId: state.activeConnectorId,
  connectionStatus: state.connectionStatus,
  isHydrated: state.isHydrated,
  walletCount: state.wallets.length,
  walletMode: state.walletMode,
});

const InternalsSection = () => {
  const getConnector = useGetConnectorInstance();
  const snapshot = useWalletStore(pickSnapshot);
  const evmConnector = getConnector("mock-evm");

  return (
    <section style={{ padding: 16 }}>
      <h2>Internals</h2>
      <p>
        mock-evm connector instance: {evmConnector?.name ?? "null"} (
        {evmConnector?.chainPlatform ?? "—"})
      </p>
      <pre style={{ background: "#f6f6f6", borderRadius: 4, padding: 8 }}>
        {JSON.stringify(snapshot, null, 2)}
      </pre>
    </section>
  );
};

export { InternalsSection };
