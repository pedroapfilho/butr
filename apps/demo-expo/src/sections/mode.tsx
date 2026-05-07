import { Text, View } from "react-native";
import { useWalletMode } from "butr";

const ModeSection = () => {
  const mode = useWalletMode();
  return (
    <View style={{ padding: 16, borderBottomWidth: 1, borderColor: "#ddd" }}>
      <Text style={{ fontSize: 18, fontWeight: "600" }}>Mode</Text>
      <Text>current: {mode}</Text>
      <Text style={{ fontSize: 12, color: "#666" }}>
        Mode is derived from connector type. Connect a wallet to change it.
      </Text>
    </View>
  );
};

export { ModeSection };
