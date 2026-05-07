import { Stack } from "expo-router";
import { WalletProvider } from "../src/wallet-provider";

const RootLayout = () => (
  <WalletProvider>
    <Stack>
      <Stack.Screen name="index" options={{ title: "butr · Expo" }} />
    </Stack>
  </WalletProvider>
);

export default RootLayout;
