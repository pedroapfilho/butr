import { Pressable, Text, View } from "react-native";
import {
  useActiveConnectorId,
  useConnectionError,
  useConnectionStatus,
  useConnectWallet,
  useConnectOIDCWallet,
  useDisconnectWallet,
  useIsConnecting,
  useIsUserDisconnected,
  useRefreshWallet,
  useResetConnectionStatus,
  useResetWallet,
  useSetConnectionStatus,
  useWalletConnected,
  type ConnectionStatus,
} from "butr";

const Btn = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    style={{ padding: 8, backgroundColor: "#eee", borderRadius: 4, margin: 4 }}
  >
    <Text>{label}</Text>
  </Pressable>
);

const ConnectionSection = () => {
  const status = useConnectionStatus();
  const isConnecting = useIsConnecting();
  const error = useConnectionError();
  const activeId = useActiveConnectorId();
  const connected = useWalletConnected();
  const isUserDisconnected = useIsUserDisconnected();

  const connect = useConnectWallet();
  const connectOIDC = useConnectOIDCWallet();
  const disconnect = useDisconnectWallet();
  const refresh = useRefreshWallet();
  const reset = useResetWallet();
  const setStatus = useSetConnectionStatus();
  const resetStatus = useResetConnectionStatus();

  const cycleStatus = () => {
    const next: ConnectionStatus =
      status === "idle" ? "connecting" : status === "connecting" ? "success" : "idle";
    setStatus(next, activeId);
  };

  return (
    <View style={{ padding: 16, borderBottomWidth: 1, borderColor: "#ddd" }}>
      <Text style={{ fontSize: 18, fontWeight: "600" }}>Connection</Text>
      <Text>
        status: {status}
        {isConnecting && " (connecting…)"}
      </Text>
      <Text>connected: {String(connected)}</Text>
      <Text>active connector: {activeId ?? "none"}</Text>
      <Text>error: {error ?? "none"}</Text>
      <Text>user disconnected flag: {String(isUserDisconnected)}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
        <Btn label="Connect EVM" onPress={() => connect("mock-evm")} />
        <Btn label="Connect OIDC" onPress={() => connectOIDC("mock-oidc")} />
        <Btn label="Disconnect EVM" onPress={() => disconnect("evm")} />
        <Btn label="Refresh EVM" onPress={() => refresh("evm")} />
        <Btn label="Reset" onPress={() => reset()} />
        <Btn label="Cycle status" onPress={cycleStatus} />
        <Btn label="Reset status" onPress={resetStatus} />
      </View>
    </View>
  );
};

export { ConnectionSection };
