import type { WalletAdapter } from "../types";
import { buildEvmAdapter } from "./eip6963-adapter";
import type { Eip6963AnnounceEvent, Eip6963ProviderInfo } from "./eip1193";

const ANNOUNCE_EVENT = "eip6963:announceProvider";
const REQUEST_EVENT = "eip6963:requestProvider";

type AdapterCallback = (adapter: WalletAdapter, info: Eip6963ProviderInfo) => void;

type DiscoverOptions = {
  /** Event target to listen on. Defaults to `window` in browser/RN/
   *  SSR'd environments; tests can pass a fresh `new EventTarget()` to
   *  exercise the discovery loop without a DOM. */
  target?: EventTarget;
};

const resolveTarget = (target?: EventTarget): EventTarget | null => {
  if (target) {
    return target;
  }
  // Use globalThis.window when present and EventTarget-shaped. Some
  // test environments inject a `window` stub that isn't a real
  // EventTarget; in that case fall back to null so callers short-circuit
  // rather than throw on `.addEventListener`.
  const candidate = (globalThis as { window?: unknown }).window;
  if (
    !candidate ||
    typeof (candidate as { addEventListener?: unknown }).addEventListener !== "function"
  ) {
    return null;
  }
  return candidate as EventTarget;
};

/**
 * Subscribe to EIP-6963 wallet announcements. Spec:
 * https://eips.ethereum.org/EIPS/eip-6963
 *
 * Flow:
 *  1. Page registers a listener for `eip6963:announceProvider`.
 *  2. Page dispatches `eip6963:requestProvider` to kick wallets that
 *     have already loaded.
 *  3. Wallets that load later still dispatch their own announcement
 *     when they boot, so the listener stays attached for the lifetime
 *     of the discovery session.
 *  4. Dedup by `info.rdns` — wallets occasionally re-announce, and
 *     `info.uuid` is regenerated per page load so it's not stable.
 *
 * Returns an unsubscribe function that removes the listener.
 * In non-browser environments (SSR, tests with no window) returns
 * a noop unsubscribe and never fires the callback.
 */
const discoverEvmAdapters = (
  onAdapter: AdapterCallback,
  options: DiscoverOptions = {},
): (() => void) => {
  const target = resolveTarget(options.target);
  if (!target) {
    return () => {};
  }

  const seen = new Set<string>();
  const handler = (event: Event) => {
    const announce = event as Eip6963AnnounceEvent;
    const detail = announce.detail;
    if (!detail || !detail.info || !detail.provider) {
      return;
    }
    const { info, provider } = detail;
    if (typeof info.rdns !== "string" || info.rdns.length === 0) {
      return;
    }
    if (seen.has(info.rdns)) {
      return;
    }
    seen.add(info.rdns);
    onAdapter(buildEvmAdapter(info, provider), info);
  };

  target.addEventListener(ANNOUNCE_EVENT, handler);
  target.dispatchEvent(new Event(REQUEST_EVENT));

  return () => {
    target.removeEventListener(ANNOUNCE_EVENT, handler);
  };
};

export { ANNOUNCE_EVENT, REQUEST_EVENT, discoverEvmAdapters };
