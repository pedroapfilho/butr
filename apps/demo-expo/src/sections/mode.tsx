import { Text, View } from "react-native";
import { useWalletMode } from "butr";

const ModeSection = () => {
  const mode = useWalletMode();
  return (
    <View style={{ borderBottomWidth: 1, borderColor: "#ddd", padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: "600" }}>Mode</Text>
      <Text>current: {mode}</Text>
      <Text style={{ color: "#666", fontSize: 12 }}>
        Mode is derived from connector type. Connect a wallet to change it.
      </Text>
    </View>
  );
};

export { ModeSection };
