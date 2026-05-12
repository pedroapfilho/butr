// Building blocks for advanced consumers who want to compose discovery
// themselves. The high-level integration lives in core butr:
// `<WalletManagerProvider auto>` + `useDiscoveredWallets()`.

// EIP-1193 / EIP-6963 types — used by adapter authors who want to
// build their own EVM adapter on top of butr's primitives.
export type {
  Eip1193Listener,
  Eip1193Provider,
  Eip1193RequestArgs,
  Eip6963AnnounceEvent,
  Eip6963ProviderDetail,
  Eip6963ProviderInfo,
} from "./eip1193";

// EVM-side adapter (EIP-6963)
export { ANNOUNCE_EVENT, REQUEST_EVENT, discoverEvmAdapters } from "./eip6963";
export {
  buildEvmAdapter,
  bytesToHex,
  chainIdDecimalToHex,
  chainIdHexToDecimal,
  formatEther,
  hexToBytes,
} from "./eip6963-adapter";

// Injected fallback — last-resort discovery for EVM wallets that
// don't announce via EIP-6963 (regional / legacy injected providers).
export type { InjectedDiscoveryOptions } from "./injected";
export { GENERIC_INJECTED_ICON, discoverInjectedAdapter } from "./injected";

// SVM-side adapter (Wallet Standard) — requires the optional peer dep
// `@wallet-standard/app` for the discovery to actually fire.
export type {
  SolanaSignAndSendTransactionFeature,
  SolanaSignAndSendTransactionInput,
  SolanaSignAndSendTransactionOutput,
  SolanaSignMessageFeature,
  SolanaSignMessageInput,
  SolanaSignMessageOutput,
  StandardConnectFeature,
  StandardDisconnectFeature,
  StandardEventsFeature,
  StandardEventsListener,
  WalletStandardAppModule,
  WalletStandardWallet,
  WalletStandardWalletAccount,
  WalletsApp,
} from "./wallet-standard-types";
export { buildSvmAdapter, slugify } from "./wallet-standard-adapter";
export { discoverSvmAdapters } from "./wallet-standard";

// Combined discovery — also used internally by `<WalletManagerProvider auto>`.
export type { DiscoverOptions } from "./discover";
export { discoverWalletAdapters } from "./discover";
