import type { ChainPlatform, ConnectedWallet, WalletMode } from "../types";
import { createBrowserStorageDriver, createMemoryStorageDriver } from "./browser-storage-driver";
import type { ConnectedWalletsRecord, StorageDriver, WalletPersistence } from "./persistence";

const VALID_CHAIN_PLATFORMS = new Set(["evm", "svm", "move", "unified"]);

type StorageConfig = {
  keyPrefix: string;
  /** Survives app restart. Defaults to localStorage on web. */
  persistent?: StorageDriver;
  /** Cleared on session end. Defaults to sessionStorage on web. */
  session?: StorageDriver;
};

class WalletStorage implements WalletPersistence {
  private connectedWalletsKey: string;
  private walletModeKey: string;
  private userDisconnectedKey: string;
  private persistent: StorageDriver;
  private session: StorageDriver;

  constructor(config: StorageConfig) {
    this.connectedWalletsKey = `${config.keyPrefix}-connected-wallets`;
    this.walletModeKey = `${config.keyPrefix}-wallet-mode`;
    this.userDisconnectedKey = `${config.keyPrefix}-user-disconnected`;

    if (config.persistent && config.session) {
      this.persistent = config.persistent;
      this.session = config.session;
    } else {
      const defaults = createBrowserStorageDriver();
      this.persistent = config.persistent ?? defaults.persistent;
      this.session = config.session ?? defaults.session;
    }
  }

  private isValidWalletData(data: unknown): data is ConnectedWalletsRecord {
    if (!data || typeof data !== "object") return false;

    const record = data as Record<string, unknown>;

    return Object.entries(record).every(([key, value]) => {
      if (typeof key !== "string" || !value || typeof value !== "object") {
        return false;
      }

      if (!VALID_CHAIN_PLATFORMS.has(key)) {
        return false;
      }

      const wallet = value as Record<string, unknown>;

      if (typeof wallet.connectorId !== "string") {
        return false;
      }
      if (!wallet.account || typeof wallet.account !== "object") {
        return false;
      }

      const account = wallet.account as Record<string, unknown>;
      if (typeof account.walletAddress !== "string") {
        return false;
      }
      if (typeof account.id !== "string") {
        return false;
      }
      if (!account.chain || typeof account.chain !== "object") {
        return false;
      }

      return true;
    });
  }

  async getConnectedWallets(): Promise<ConnectedWalletsRecord> {
    try {
      const stored = await this.persistent.getItem(this.connectedWalletsKey);
      if (!stored) {
        return {};
      }

      const parsed: unknown = JSON.parse(stored);

      if (!this.isValidWalletData(parsed)) {
        console.warn("Invalid wallet data found in storage, clearing...");
        await this.clearConnectedWallets();
        return {};
      }

      return parsed;
    } catch (error) {
      console.warn("Failed to parse wallet data from storage:", error);
      await this.clearConnectedWallets();
      return {};
    }
  }

  async setConnectedWallets(wallets: Map<ChainPlatform, ConnectedWallet>): Promise<void> {
    try {
      const serializable = Object.fromEntries(
        [...wallets.entries()].map(([platform, wallet]) => [
          platform,
          {
            account: wallet.account,
            connectorId: wallet.connector.id,
          },
        ]),
      );
      await this.persistent.setItem(this.connectedWalletsKey, JSON.stringify(serializable));
    } catch (error) {
      console.warn("Failed to persist connected wallets:", error);
    }
  }

  async removeConnectedWallet(chainPlatform: ChainPlatform): Promise<void> {
    try {
      const stored = await this.getConnectedWallets();
      if (stored[chainPlatform]) {
        const { [chainPlatform]: _, ...remaining } = stored;
        await this.persistent.setItem(this.connectedWalletsKey, JSON.stringify(remaining));
      }
    } catch (error) {
      console.warn(`Failed to remove ${chainPlatform} wallet from storage:`, error);
    }
  }

  async clearConnectedWallets(): Promise<void> {
    await this.persistent.removeItem(this.connectedWalletsKey);
  }

  async clearAll(): Promise<void> {
    await this.persistent.removeItem(this.connectedWalletsKey);
    await this.persistent.removeItem(this.walletModeKey);
  }

  async getWalletMode(): Promise<WalletMode> {
    try {
      const mode = await this.persistent.getItem(this.walletModeKey);
      if (!mode) {
        return "none";
      }

      if (mode === "smart-wallet" || mode === "external-wallet" || mode === "none") {
        return mode;
      }

      console.warn("Invalid wallet mode in storage, resetting to none");
      await this.clearWalletMode();
      return "none";
    } catch (error) {
      console.warn("Failed to get wallet mode from storage:", error);
      return "none";
    }
  }

  async setWalletMode(mode: WalletMode): Promise<void> {
    try {
      await this.persistent.setItem(this.walletModeKey, mode);
    } catch (error) {
      console.warn("Failed to set wallet mode in storage:", error);
    }
  }

  async clearWalletMode(): Promise<void> {
    await this.persistent.removeItem(this.walletModeKey);
  }

  /**
   * Disconnect-intent tracking.
   *
   * Lives in the session driver: survives component remounts (unlike refs)
   * but clears when the session ends (unlike the persistent driver).
   * Prevents auto-connect from firing immediately after a manual disconnect,
   * while still allowing auto-connect on fresh sessions.
   */
  async isUserDisconnected(): Promise<boolean> {
    try {
      const value = await this.session.getItem(this.userDisconnectedKey);
      return value === "true";
    } catch {
      return false;
    }
  }

  async markUserDisconnected(value: boolean): Promise<void> {
    try {
      if (value) {
        await this.session.setItem(this.userDisconnectedKey, "true");
      } else {
        await this.session.removeItem(this.userDisconnectedKey);
      }
    } catch {
      // ignore
    }
  }
}

export { createMemoryStorageDriver, WalletStorage };
