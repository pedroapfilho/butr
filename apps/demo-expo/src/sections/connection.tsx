import { Pressable, Text, View } from "react-native";
import {
  useActiveConnectorId,
  useConnectionError,
  useConnectionStatus,
  useConnectWallet,
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
    style={{ backgroundColor: "#eee", borderRadius: 4, margin: 4, padding: 8 }}
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
  const disconnect = useDisconnectWallet();
  const refresh = useRefreshWallet();
  const reset = useResetWallet();
  const setStatus = useSetConnectionStatus();
  const resetStatus = useResetConnectionStatus();

  const cycleStatus = () => {
    let next: ConnectionStatus = "idle";
    if (status === "idle") {
      next = "connecting";
    } else if (status === "connecting") {
      next = "success";
    }
    setStatus(next, activeId);
  };

  return (
    <View style={{ borderBottomWidth: 1, borderColor: "#ddd", padding: 16 }}>
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
        <Btn label="Connect SVM" onPress={() => connect("mock-svm")} />
        <Btn label="Disconnect EVM" onPress={() => disconnect("evm")} />
        <Btn label="Disconnect SVM" onPress={() => disconnect("svm")} />
        <Btn label="Refresh EVM" onPress={() => refresh("evm")} />
        <Btn label="Reset" onPress={() => reset()} />
        <Btn label="Cycle status" onPress={cycleStatus} />
        <Btn label="Reset status" onPress={resetStatus} />
      </View>
    </View>
  );
};

export { ConnectionSection };
