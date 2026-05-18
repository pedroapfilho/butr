// Combined chain registries
export { CHAINS, CHAINS_BY_PLATFORM } from "./chains";

// Discovery primitives
export type { DiscoverOptions } from "./discover";
export { discoverWalletAdapters, resolveDiscoverOptions } from "./discover";

export type { DiscoveryBus, DiscoveryPath } from "./discovery-bus";
export { createDiscoveryBus } from "./discovery-bus";

// Batteries-included discovery source for <WalletManagerProvider discovery=… />
export { autoDiscovery } from "./auto-discovery";
