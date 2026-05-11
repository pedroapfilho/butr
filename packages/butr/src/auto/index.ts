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

// SVM-side adapter (Wallet Standard) — stub, see file for context.
export { discoverSvmAdapters } from "./wallet-standard";

// Combined discovery
export { discoverWalletAdapters } from "./discover";

// React surface
export type { AutoWalletManagerProviderProps } from "./react";
export { AutoWalletManagerProvider, useDiscoveredWallets } from "./react";
