import type {
  Account,
  ChainPlatform,
  ConnectedWallet,
  UIConnector,
  WalletManagerConfig,
} from "../types";
import type { WalletPersistence } from "../storage";

/** Connection status for wallet connection flows */
type ConnectionStatus = "idle" | "connecting" | "success" | "error";

/** Public state and methods exposed to components */
type WalletState = {
  activeConnectorId: string | null;
  connected: boolean;
  // Public State
  connectedWallets: Map<ChainPlatform, ConnectedWallet>;
  connecting: boolean;
  connectionError: string | null;
  // Connection status tracking (for UI coordination)
  connectionStatus: ConnectionStatus;
  // Public Actions
  connectWallet: (
    id: string,
    onSuccess?: (wallet: ConnectedWallet) => void,
    onError?: (error: Error) => void,
  ) => Promise<void>;

  disconnectWallet: (chainPlatform: ChainPlatform) => void;
  getConnectorInstance: (id: string) => UIConnector | null;
  getWalletByPlatform: (chainPlatform: ChainPlatform) => ConnectedWallet | undefined;

  getWalletForOperation: (chainPlatform: ChainPlatform) => ConnectedWallet | undefined;
  hasAnyWallet: boolean;
  isHydrated: boolean;
  /** Reactive mirror of the session-scoped disconnect-intent flag. */
  isUserDisconnected: boolean;
  isWalletConnected: (chainPlatform: ChainPlatform) => boolean;
  refreshWallet: (chainPlatform: ChainPlatform) => void;
  reset: () => void;
  resetConnectionStatus: () => void;
  setConnectionError: (error: string | null) => void;
  // Connection status actions
  setConnectionStatus: (status: ConnectionStatus, connectorId?: string | null) => void;

  updateWalletAccount: (chainPlatform: ChainPlatform, newAccount: Account) => void;
  wallets: Array<ConnectedWallet>;
};

/** Internal state including private methods and config */
type InternalWalletState = WalletState & {
  _config: WalletManagerConfig;
  _hydrateWallets: () => Promise<void>;

  _markUserDisconnected: (value: boolean) => void;
  _persistConnectedWallets: (wallets: Map<ChainPlatform, ConnectedWallet>) => void;
  _storage: WalletPersistence;
};

type HydrateResult = {
  connected: boolean;
  connectedWallets: Map<ChainPlatform, ConnectedWallet>;
  hasAnyWallet: boolean;
  isUserDisconnected: boolean;
  wallets: Array<ConnectedWallet>;
};

const logStorageError = (context: string) => (error: unknown) => {
  console.warn(`[butr] ${context}:`, error);
};

/** Run an async operation fire-and-forget, calling onError if it throws. */
const run = async (fn: () => Promise<void>, onError: (e: unknown) => void): Promise<void> => {
  try {
    await fn();
  } catch (error) {
    onError(error);
  }
};

const isProduction = (): boolean => {
  try {
    const proc = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process;
    return proc?.env?.NODE_ENV === "production";
  } catch {
    return false;
  }
};

/** Restores persisted wallets from storage. */
const hydrateFromStorage = async (
  storage: WalletPersistence,
  createConnector: WalletManagerConfig["createConnector"],
): Promise<HydrateResult> => {
  const [stored, userDisconnected] = await Promise.all([
    storage.getConnectedWallets(),
    storage.isUserDisconnected(),
  ]);
  const walletsMap = new Map<ChainPlatform, ConnectedWallet>();

  for (const [platform, walletData] of Object.entries(stored)) {
    const isValidWalletData =
      typeof walletData === "object" &&
      "connectorId" in walletData &&
      "account" in walletData &&
      typeof walletData.connectorId === "string";

    if (!isValidWalletData) {
      console.warn(`[butr] validation failed for ${platform}, walletData:`, { walletData });
      continue;
    }

    const connector = createConnector(walletData.connectorId);

    if (!connector) {
      console.warn(`[butr] could not instantiate connector ${walletData.connectorId}`);
      continue;
    }

    try {
      // oxlint-disable-next-line no-await-in-loop -- wallets must restore sequentially; each may fail independently
      await connector.connect();
      // oxlint-disable-next-line no-await-in-loop -- wallets must restore sequentially; each may fail independently
      const freshAccount = await connector.getAccount();
      const accountToUse = freshAccount || walletData.account;

      walletsMap.set(platform as ChainPlatform, {
        account: accountToUse,
        connector,
      });
    } catch (error) {
      console.warn(`[butr] failed to restore connector ${walletData.connectorId}:`, error);
      // oxlint-disable-next-line no-await-in-loop -- wallets must restore sequentially; each may fail independently
      await storage
        .removeConnectedWallet(platform as ChainPlatform)
        .catch(logStorageError("failed to remove broken entry"));
    }
  }

  const wallets = [...walletsMap.values()];
  const hasAnyWallet = walletsMap.size > 0;

  return {
    connected: hasAnyWallet,
    connectedWallets: walletsMap,
    hasAnyWallet,
    isUserDisconnected: userDisconnected,
    wallets,
  };
};

export type { ConnectionStatus, HydrateResult, InternalWalletState, WalletState };
export { hydrateFromStorage, isProduction, logStorageError, run };
