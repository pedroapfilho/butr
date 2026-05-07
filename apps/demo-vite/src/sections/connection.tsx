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
    <section style={{ padding: 16, borderBottom: "1px solid #ddd" }}>
      <h2>Connection</h2>
      <ul>
        <li>
          status: <strong>{status}</strong> {isConnecting && "(connecting…)"}
        </li>
        <li>connected: {String(connected)}</li>
        <li>active connector: {activeId ?? "none"}</li>
        <li>error: {error ?? "none"}</li>
        <li>user disconnected flag: {String(isUserDisconnected)}</li>
      </ul>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => connect("mock-evm")}>Connect EVM</button>
        <button onClick={() => connectOIDC("mock-oidc")}>Connect OIDC</button>
        <button onClick={() => disconnect("evm")}>Disconnect EVM</button>
        <button onClick={() => refresh("evm")}>Refresh EVM</button>
        <button onClick={() => reset()}>Reset</button>
        <button onClick={cycleStatus}>Cycle status</button>
        <button onClick={resetStatus}>Reset status</button>
      </div>
    </section>
  );
};

export { ConnectionSection };
