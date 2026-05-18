import type { WalletSource } from "@butr/core";
import { type DiscoverOptions, discoverWalletAdapters } from "./discover";

/**
 * The batteries-included discovery source: composes EVM (EIP-6963 +
 * injected fallback) and SVM (Wallet Standard). Pass to
 * `<WalletManagerProvider discovery={autoDiscovery()} />`. Restrict
 * platforms with `options`, e.g. `autoDiscovery({ evm: true })`.
 */
const autoDiscovery = (options?: DiscoverOptions): WalletSource => ({
  subscribe: (onAdapter) => discoverWalletAdapters(onAdapter, options),
});

export { autoDiscovery };
