import type { WalletSource } from "@butr/core";
import { type DiscoverOptions, discoverWalletAdapters } from "./discover";

/**
 * Create a `WalletSource` that composes EVM (EIP-6963 + injected
 * fallback) and SVM (Wallet Standard) discovery. Pass `options` to
 * restrict to a single platform.
 *
 * Implementations of `WalletSource` are the discovery-package contract:
 * other discovery transports (custom enterprise sources, future
 * hardware-wallet packages) implement the same shape without depending
 * on `@butr/wallets`.
 */
const createDiscoveryWalletSource = (options?: DiscoverOptions): WalletSource => ({
  subscribe: (onAdapter) => discoverWalletAdapters(onAdapter, options),
});

export { createDiscoveryWalletSource };
