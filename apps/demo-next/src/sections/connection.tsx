"use client";

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
    <section style={{ borderBottom: "1px solid #ddd", padding: 16 }}>
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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button onClick={() => connect("mock-evm")} type="button">
          Connect EVM
        </button>
        <button onClick={() => connect("mock-svm")} type="button">
          Connect SVM
        </button>
        <button onClick={() => disconnect("evm")} type="button">
          Disconnect EVM
        </button>
        <button onClick={() => disconnect("svm")} type="button">
          Disconnect SVM
        </button>
        <button onClick={() => refresh("evm")} type="button">
          Refresh EVM
        </button>
        <button onClick={() => reset()} type="button">
          Reset
        </button>
        <button onClick={cycleStatus} type="button">
          Cycle status
        </button>
        <button onClick={resetStatus} type="button">
          Reset status
        </button>
      </div>
    </section>
  );
};

export { ConnectionSection };
