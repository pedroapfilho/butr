import {
  useConnectedWallets,
  useConnectedWalletsMap,
  useConnectedWalletsMapByPlatform,
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
  namespace: "eip155",
  reference: "1",
  name: "Ethereum",
};

const formatWallet = (w: ConnectedWallet | undefined) =>
  w ? `${w.connector.id} → ${w.account.walletAddress}` : "none";

const WalletsSection = () => {
  const wallets = useConnectedWallets();
  const map = useConnectedWalletsMap();
  const mapByPlatform = useConnectedWalletsMapByPlatform();
  const hasAny = useHasAnyWallet();
  const isWalletConnected = useIsWalletConnected();
  const getByChain = useGetWalletByChain();
  const getByPlatform = useGetWalletByPlatform();
  const getForOperation = useGetWalletForOperation();
  const reactiveWallet = useWalletForOperation("evm");
  const updateAccount = useUpdateWalletAccount();

  const rotateAccount = () => {
    const next: Account = {
      chain: ROTATING_CHAIN,
      walletAddress: `0x${Date.now().toString(16).padStart(40, "0")}`.slice(0, 42),
      id: `evm:${Date.now()}`,
    };
    updateAccount("evm", next);
  };

  return (
    <section style={{ padding: 16, borderBottom: "1px solid #ddd" }}>
      <h2>Wallets</h2>
      <ul>
        <li>has any: {String(hasAny)}</li>
        <li>is evm connected: {String(isWalletConnected("evm"))}</li>
        <li>
          list ({wallets.length}):{" "}
          {wallets.map((w) => w.connector.id).join(", ") || "none"}
        </li>
        <li>by chain (evm): {formatWallet(getByChain("evm"))}</li>
        <li>by platform (evm): {formatWallet(getByPlatform("evm"))}</li>
        <li>for operation (evm): {formatWallet(getForOperation("evm"))}</li>
        <li>reactive evm: {formatWallet(reactiveWallet)}</li>
        <li>map size: {map.size}</li>
        <li>
          map-by-platform keys:{" "}
          {Array.from(mapByPlatform.keys()).join(", ") || "none"}
        </li>
      </ul>
      <button onClick={rotateAccount}>Rotate active EVM account</button>
    </section>
  );
};

export { WalletsSection };
