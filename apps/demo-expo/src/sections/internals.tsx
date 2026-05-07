import { Text, View } from "react-native";
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
    <View style={{ padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: "600" }}>Internals</Text>
      <Text>
        mock-evm: {evmConnector?.name ?? "null"} ({evmConnector?.chainPlatform ?? "—"})
      </Text>
      <View
        style={{ backgroundColor: "#f6f6f6", padding: 8, borderRadius: 4, marginTop: 8 }}
      >
        <Text style={{ fontFamily: "monospace" }}>
          {JSON.stringify(snapshot, null, 2)}
        </Text>
      </View>
    </View>
  );
};

export { InternalsSection };
