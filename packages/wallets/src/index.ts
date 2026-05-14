// Discovery primitives
export type { DiscoverOptions } from "./discover";
export { discoverWalletAdapters, resolveDiscoverOptions } from "./discover";

export type { DiscoveryBus, DiscoveryPath } from "./discovery-bus";
export { createDiscoveryBus } from "./discovery-bus";

// WalletSource composition
export { createDiscoveryWalletSource } from "./wallet-source";

// React convenience wrapper
export type { AutoWalletManagerProviderProps } from "./auto-provider";
export { AutoWalletManagerProvider, useDiscoveredWallets } from "./auto-provider";
