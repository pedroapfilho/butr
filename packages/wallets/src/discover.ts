import type { WalletAdapter } from "@butr/core";
import { discoverEvmAdapters, discoverInjectedAdapter } from "@butr/evm";
import { discoverSvmAdapters } from "@butr/svm";
import { createDiscoveryBus } from "./discovery-bus";

/**
 * Which platforms to discover. Omitting a flag (or setting it to
 * `false`) skips that platform entirely — useful for apps that target
 * only EVM or only Solana, so unused listeners don't fire and unused
 * adapters don't appear in the discovered-wallets list surfaced by the
 * provider's `discovery` source.
 *
 * Default when omitted: `evm` and `svm` both `true`, `injected`
 * `true` (only meaningful when `evm` is also true).
 *
 * `injected` is the last-resort EVM fallback for wallets that don't
 * announce via EIP-6963 — regional or legacy injected providers like
 * KuCoin, Bitget, BitKeep, Frontier. It waits ~150ms for EIP-6963
 * announcements, then if none have fired and `window.ethereum`
 * exists, emits a generic "Browser wallet" adapter. Disable when
 * targeting only modern EIP-6963 wallets to skip the timer.
 */
type DiscoverOptions = {
  evm?: boolean;
  injected?: boolean;
  svm?: boolean;
};

/**
 * Resolve an `auto` prop input into a concrete set of enabled
 * platforms. The single place where the `true | DiscoverOptions`
 * union is interpreted.
 *
 * **Defaults**
 *
 *  - `true` (or omitted) → both platforms enabled. The
 *    `<WalletManagerProvider auto>` shorthand uses this path.
 *  - `false` (or `undefined`) → discovery disabled.
 *  - Object form → opt-in. `{ evm: true }` discovers only EVM;
 *    unspecified flags default to `false`, so `{ evm: true }` means
 *    "EVM-only app" the way most callers expect.
 */
const resolveDiscoverOptions = (
  auto: true | false | DiscoverOptions | undefined,
): { active: boolean; evm: boolean; injected: boolean; svm: boolean } => {
  if (auto === undefined || auto === false) {
    return { active: false, evm: false, injected: false, svm: false };
  }
  if (auto === true) {
    return { active: true, evm: true, injected: true, svm: true };
  }
  // Object form: opt-in. `injected` defaults to `true` IF the EVM
  // path is also enabled (it's a fallback for EVM-side discovery —
  // useless without an EVM consumer). EVM-only apps get the safety
  // net for free; SVM-only apps don't pay the 150ms timer.
  const evm = auto.evm === true;
  return {
    active: true,
    evm,
    injected: evm && auto.injected !== false,
    svm: auto.svm === true,
  };
};

/**
 * Subscribe to both EIP-6963 (EVM) and Wallet Standard (SVM) at once.
 * Calls `onAdapter` exactly once per unique wallet, deduplicated by
 * `adapter.id`. See `resolveDiscoverOptions` for the defaults that
 * apply when `options` is omitted.
 *
 * The returned function unsubscribes whichever listeners were attached.
 */
const discoverWalletAdapters = (
  onAdapter: (adapter: WalletAdapter) => void,
  options?: DiscoverOptions,
): (() => void) => {
  const resolved = resolveDiscoverOptions(options ?? true);

  const bus = createDiscoveryBus(onAdapter);
  bus.register(resolved.evm ? discoverEvmAdapters : null);
  bus.register(resolved.svm ? discoverSvmAdapters : null);
  // Injected fallback only emits if no EIP-6963 adapter has fired
  // by the settle deadline. `bus.hasAny` exposes that state through
  // the bus interface rather than via a closure shared with the
  // orchestrator.
  bus.register(
    resolved.injected
      ? (emit) => discoverInjectedAdapter(emit, { hasAnyEip6963Adapter: bus.hasAny })
      : null,
  );

  return () => bus.unsubscribeAll();
};

export type { DiscoverOptions };
export { discoverWalletAdapters, resolveDiscoverOptions };
