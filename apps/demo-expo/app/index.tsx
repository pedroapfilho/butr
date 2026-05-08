import { ScrollView, View, Text } from "react-native";
import { ConnectionSection } from "../src/sections/connection";
import { InternalsSection } from "../src/sections/internals";
import { WalletsSection } from "../src/sections/wallets";

const Index = () => (
  <ScrollView style={{ flex: 1 }}>
    <View style={{ padding: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: "600" }}>butr · Expo</Text>
    </View>
    <ConnectionSection />
    <WalletsSection />
    <InternalsSection />
  </ScrollView>
);

export default Index;
