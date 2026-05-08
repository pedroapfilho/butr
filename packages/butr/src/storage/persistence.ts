import type { Account, ChainPlatform, ConnectedWallet } from "../types";

type MaybePromise<T> = T | Promise<T>;

/** Low-level key/value driver. Sync on web (localStorage, MMKV),
 *  async on React Native (AsyncStorage). */
type StorageDriver = {
  getItem: (key: string) => MaybePromise<string | null>;
  removeItem: (key: string) => MaybePromise<void>;
  setItem: (key: string, value: string) => MaybePromise<void>;
};

type StoredWalletData = {
  account: Account;
  connectorId: string;
};

type ConnectedWalletsRecord = Partial<Record<string, StoredWalletData>>;

type WalletPersistence = {
  clearAll(): Promise<void>;
  clearConnectedWallets(): Promise<void>;
  getConnectedWallets(): Promise<ConnectedWalletsRecord>;
  isUserDisconnected(): Promise<boolean>;
  markUserDisconnected(value: boolean): Promise<void>;
  removeConnectedWallet(chainPlatform: ChainPlatform): Promise<void>;
  setConnectedWallets(wallets: Map<ChainPlatform, ConnectedWallet>): Promise<void>;
};

export type {
  ConnectedWalletsRecord,
  MaybePromise,
  StorageDriver,
  StoredWalletData,
  WalletPersistence,
};
