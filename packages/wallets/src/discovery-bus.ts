import type { WalletAdapter } from "@butr/core";

/**
 * A discovery path registers itself by accepting an `emit` callback and
 * returning an unsubscribe function. The path calls `emit(adapter)`
 * each time it finds one; the bus handles dedup. This is the only
 * shape every discovery transport needs to satisfy.
 */
type DiscoveryPath = (emit: (adapter: WalletAdapter) => void) => () => void;

/**
 * Coordinates one or more discovery paths behind a single dedup +
 * fan-out layer. Each registered path emits adapters; the bus drops
 * duplicates by `adapter.id` and forwards the rest to the consumer
 * `onAdapter` callback exactly once per id.
 *
 * The bus exposes `hasAny` so paths whose contract depends on the
 * presence of earlier paths (the injected EVM fallback, which only
 * emits if no EIP-6963 wallet has fired) can query without the
 * orchestrator having to hand them a private closure over its dedup
 * set.
 */
type DiscoveryBus = {
  /** True iff at least one adapter has been emitted by any registered
   *  path since this bus was created. Used by the injected fallback
   *  to skip emitting when standards-based discovery has already
   *  surfaced a wallet. */
  hasAny: () => boolean;
  /**
   * Register a discovery path with the bus. The path receives the
   * bus's dedup-aware `emit` function and returns its own unsubscribe
   * handle, which the bus tracks so `unsubscribeAll` can tear them
   * down together. No-op if `path` is `null`.
   */
  register: (path: DiscoveryPath | null) => void;
  /** Tear down every registered path. */
  unsubscribeAll: () => void;
};

const createDiscoveryBus = (onAdapter: (adapter: WalletAdapter) => void): DiscoveryBus => {
  const seen = new Set<string>();
  const unsubs: Array<() => void> = [];

  const emit = (adapter: WalletAdapter) => {
    if (seen.has(adapter.id)) {
      return;
    }
    seen.add(adapter.id);
    onAdapter(adapter);
  };

  return {
    hasAny: () => seen.size > 0,
    register: (path) => {
      if (!path) {
        return;
      }
      unsubs.push(path(emit));
    },
    unsubscribeAll: () => {
      for (const unsub of unsubs) {
        try {
          unsub();
        } catch (error: unknown) {
          console.warn("[butr] discovery unsubscribe threw:", error);
        }
      }
      unsubs.length = 0;
    },
  };
};

export type { DiscoveryBus, DiscoveryPath };
export { createDiscoveryBus };
