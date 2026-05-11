import type { WalletAdapter } from "../types";
import { discoverEvmAdapters } from "./eip6963";
import { discoverSvmAdapters } from "./wallet-standard";

/**
 * Subscribe to both EIP-6963 (EVM) and Wallet Standard (SVM, currently
 * stubbed) at once. Calls `onAdapter` exactly once per unique wallet,
 * deduplicated by `adapter.id`.
 *
 * The returned function unsubscribes both listeners.
 */
const discoverWalletAdapters = (onAdapter: (adapter: WalletAdapter) => void): (() => void) => {
  const seen = new Set<string>();
  const add = (adapter: WalletAdapter) => {
    if (seen.has(adapter.id)) {
      return;
    }
    seen.add(adapter.id);
    onAdapter(adapter);
  };

  const unsubEvm = discoverEvmAdapters(add);
  const unsubSvm = discoverSvmAdapters(add);

  return () => {
    unsubEvm();
    unsubSvm();
  };
};

export { discoverWalletAdapters };
