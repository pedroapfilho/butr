import type { WalletAdapter } from "../types";
import { buildEvmAdapter } from "./eip6963-adapter";
import type { Eip1193Provider, Eip6963ProviderInfo } from "./eip1193";

/**
 * Generic wallet icon (a stylised purse SVG, ~600 bytes). Used as
 * the fallback icon when an injected provider has no EIP-6963 info.
 * Inline rather than a network fetch so the picker doesn't flicker.
 */
const GENERIC_INJECTED_ICON =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMjEgMTJWN0g1YTIgMiAwIDAgMSAwLTQgaDE0djQiLz48cGF0aCBkPSJNMyA1djE0YTIgMiAwIDAgMCAyIDJoMTZ2LTVNMjEgMTIgaC0zYTIgMiAwIDAgMC0yIDJ2MGEyIDIgMCAwIDAgMiAyaDN6Ii8+PC9zdmc+";

const DEFAULT_SETTLE_MS = 150;

type InjectedDiscoveryOptions = {
  /**
   * How long to wait for EIP-6963 announcements before falling back
   * to `window.ethereum`. Most wallets announce within the first
   * frame; 150ms is a conservative settle window that keeps the
   * picker responsive while giving slow announcements time to land.
   */
  settleMs?: number;
  /**
   * Predicate the fallback consults before emitting — if any EIP-6963
   * adapter has been registered by the time the settle timer fires,
   * the injected fallback is skipped (the wallet is already covered
   * via the standards path; we don't want a duplicate).
   *
   * `discoverWalletAdapters` wires this to the shared `seen` set so
   * the dedupe is automatic. Callers using `discoverInjectedAdapter`
   * directly should pass their own check or omit it (always emit).
   */
  hasAnyEip6963Adapter?: () => boolean;
  /** Override the global `window` reference (tests, iframes). */
  target?: { ethereum?: unknown } | null;
};

const readEthereum = (
  target: InjectedDiscoveryOptions["target"],
): Eip1193Provider | null => {
  const host = target === undefined ? (typeof window === "undefined" ? null : window) : target;
  if (!host) {
    return null;
  }
  const eth = (host as { ethereum?: unknown }).ethereum;
  if (!eth || typeof (eth as { request?: unknown }).request !== "function") {
    return null;
  }
  return eth as Eip1193Provider;
};

/**
 * Last-resort discovery path for EVM wallets that DON'T announce via
 * EIP-6963. Most modern wallets (MetaMask, Rabby, Coinbase, Phantom,
 * Brave, etc.) do announce, so the standards-based path
 * (`discoverEvmAdapters`) covers them. This module catches the long
 * tail: regional wallets (KuCoin, Bitget, BitKeep, Okto, Frontier)
 * and older builds that only expose `window.ethereum`.
 *
 * **Coordination**: the fallback waits `settleMs` (default 150ms)
 * after subscription, then consults `hasAnyEip6963Adapter` if
 * provided. If any EIP-6963 adapter has already been registered, we
 * skip emission — assume the same wallet is also speaking standards
 * and we'd just be duplicating. If no EIP-6963 adapter showed up but
 * `window.ethereum` does, we emit a generic adapter.
 *
 * The emitted adapter has `rdns: "injected:legacy"` so consumers can
 * distinguish it from EIP-6963 adapters in the picker UI.
 */
const discoverInjectedAdapter = (
  onAdapter: (adapter: WalletAdapter) => void,
  options: InjectedDiscoveryOptions = {},
): (() => void) => {
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
  let cancelled = false;
  const timer = setTimeout(() => {
    if (cancelled) {
      return;
    }
    if (options.hasAnyEip6963Adapter?.()) {
      return;
    }
    const provider = readEthereum(options.target);
    if (!provider) {
      return;
    }
    const info: Eip6963ProviderInfo = {
      icon: GENERIC_INJECTED_ICON,
      name: "Browser wallet",
      rdns: "injected:legacy",
      uuid: "injected:legacy",
    };
    onAdapter(buildEvmAdapter(info, provider));
  }, settleMs);

  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
};

export type { InjectedDiscoveryOptions };
export { GENERIC_INJECTED_ICON, discoverInjectedAdapter };
