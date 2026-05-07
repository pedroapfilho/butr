import { useGetConnectorInstance, useWalletStore, type WalletStoreState } from "butr";

const pickSnapshot = (state: WalletStoreState) => ({
  connectionStatus: state.connectionStatus,
  walletMode: state.walletMode,
  activeConnectorId: state.activeConnectorId,
  walletCount: state.wallets.length,
  isHydrated: state.isHydrated,
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
      <pre style={{ background: "#f6f6f6", padding: 8, borderRadius: 4 }}>
        {JSON.stringify(snapshot, null, 2)}
      </pre>
    </section>
  );
};

export { InternalsSection };
