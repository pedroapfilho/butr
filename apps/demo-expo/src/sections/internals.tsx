import { Text, View } from "react-native";
import { useGetConnectorInstance, useWalletStore, type WalletStoreState } from "butr";

const pickSnapshot = (state: WalletStoreState) => ({
  activeConnectorId: state.activeConnectorId,
  connectionStatus: state.connectionStatus,
  isHydrated: state.isHydrated,
  walletCount: state.wallets.length,
});

const InternalsSection = () => {
  const getConnector = useGetConnectorInstance();
  const snapshot = useWalletStore(pickSnapshot);
  const evmConnector = getConnector("mock-evm");
  const svmConnector = getConnector("mock-svm");

  return (
    <View style={{ padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: "600" }}>Internals</Text>
      <Text>
        mock-evm: {evmConnector?.name ?? "null"} ({evmConnector?.chainPlatform ?? "—"})
      </Text>
      <Text>
        mock-svm: {svmConnector?.name ?? "null"} ({svmConnector?.chainPlatform ?? "—"})
      </Text>
      <View style={{ backgroundColor: "#f6f6f6", borderRadius: 4, marginTop: 8, padding: 8 }}>
        <Text style={{ fontFamily: "monospace" }}>{JSON.stringify(snapshot, null, 2)}</Text>
      </View>
    </View>
  );
};

export { InternalsSection };
