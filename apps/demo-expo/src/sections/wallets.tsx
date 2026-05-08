import { Pressable, Text, View } from "react-native";
import {
  useConnectedWallets,
  useConnectedWalletsMap,
  useGetWalletByChain,
  useGetWalletByPlatform,
  useGetWalletForOperation,
  useHasAnyWallet,
  useIsWalletConnected,
  useUpdateWalletAccount,
  useWalletForOperation,
  type Account,
  type ChainBase,
  type ConnectedWallet,
} from "butr";

const ROTATING_CHAIN: ChainBase = {
  id: "eip155:1",
  name: "Ethereum",
  namespace: "eip155",
  reference: "1",
};

const formatWallet = (w: ConnectedWallet | undefined) =>
  w ? `${w.connector.id} → ${w.account.walletAddress}` : "none";

const WalletsSection = () => {
  const wallets = useConnectedWallets();
  const map = useConnectedWalletsMap();
  const hasAny = useHasAnyWallet();
  const isWalletConnected = useIsWalletConnected();
  const getByChain = useGetWalletByChain();
  const getByPlatform = useGetWalletByPlatform();
  const getForOperation = useGetWalletForOperation();
  const reactiveEvm = useWalletForOperation("evm");
  const reactiveSvm = useWalletForOperation("svm");
  const updateAccount = useUpdateWalletAccount();

  const rotateAccount = () => {
    const next: Account = {
      chain: ROTATING_CHAIN,
      id: `evm:${Date.now()}`,
      walletAddress: `0x${Date.now().toString(16).padStart(40, "0")}`.slice(0, 42),
    };
    updateAccount("evm", next);
  };

  return (
    <View style={{ borderBottomWidth: 1, borderColor: "#ddd", padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: "600" }}>Wallets</Text>
      <Text>has any: {String(hasAny)}</Text>
      <Text>is evm connected: {String(isWalletConnected("evm"))}</Text>
      <Text>is svm connected: {String(isWalletConnected("svm"))}</Text>
      <Text>
        list ({wallets.length}): {wallets.map((w) => w.connector.id).join(", ") || "none"}
      </Text>
      <Text>by chain (evm): {formatWallet(getByChain("evm"))}</Text>
      <Text>by platform (svm): {formatWallet(getByPlatform("svm"))}</Text>
      <Text>for operation (evm): {formatWallet(getForOperation("evm"))}</Text>
      <Text>reactive evm: {formatWallet(reactiveEvm)}</Text>
      <Text>reactive svm: {formatWallet(reactiveSvm)}</Text>
      <Text>map keys: {[...map.keys()].join(", ") || "none"}</Text>
      <Pressable
        onPress={rotateAccount}
        style={{
          alignSelf: "flex-start",
          backgroundColor: "#eee",
          borderRadius: 4,
          marginTop: 8,
          padding: 8,
        }}
      >
        <Text>Rotate active EVM account</Text>
      </Pressable>
    </View>
  );
};

export { WalletsSection };
