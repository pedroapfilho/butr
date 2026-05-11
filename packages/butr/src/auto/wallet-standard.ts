import type { WalletAdapter } from "../types";
import { buildSvmAdapter } from "./wallet-standard-adapter";
import type { WalletStandardAppModule, WalletStandardWallet } from "./wallet-standard-types";

/**
 * Subscribe to Solana Wallet Standard announcements.
 * Spec: https://github.com/wallet-standard/wallet-standard
 *
 * Runtime requires the `@wallet-standard/app` package, which is an
 * **optional peer dependency** of butr. EVM-only consumers don't need
 * to install it — discovery will silently skip the SVM side if the
 * module isn't resolvable.
 *
 * Install for SVM auto-discovery:
 *
 *     npm install @wallet-standard/app
 *
 * The function returns a synchronous unsubscribe that's safe to call
 * before the dynamic import has resolved (it sets a cancellation flag
 * and tears down any subscription that registered in the meantime).
 *
 * Adapter generation is delegated to `buildSvmAdapter`, which gates
 * features on what each wallet advertises. See that file for the
 * limitations (`getBalance` needs an RPC, etc.).
 */
const discoverSvmAdapters = (onAdapter: (adapter: WalletAdapter) => void): (() => void) => {
  let cancelled = false;
  let internalUnsub: (() => void) | null = null;

  void (async () => {
    let mod: WalletStandardAppModule;
    try {
      // Dynamic import: only resolved when SVM discovery is exercised.
      // The cast narrows the loose ambient declaration (see
      // `wallet-standard-types.ts`) into the precise minimal surface
      // butr's adapter relies on. The ambient declaration means
      // TypeScript always resolves the module name at compile time,
      // regardless of whether the optional peer dep is installed —
      // no `@ts-expect-error`/`@ts-ignore` needed. At runtime, the
      // import either succeeds (peer dep installed) or throws (peer
      // dep absent), and the catch below handles the latter.
      mod = (await import("@wallet-standard/app")) as unknown as WalletStandardAppModule;
    } catch {
      // @wallet-standard/app not installed. SVM discovery is disabled;
      // EVM discovery still works. Consumers can wire SVM wallets
      // manually via WalletManagerConfig.createConnector if they
      // skipped the optional peer dep on purpose.
      return;
    }
    if (cancelled) {
      return;
    }

    const seen = new Set<string>();
    const tryAdd = (wallet: WalletStandardWallet) => {
      const adapter = buildSvmAdapter(wallet);
      if (!adapter || seen.has(adapter.id)) {
        return;
      }
      seen.add(adapter.id);
      onAdapter(adapter);
    };

    const app = mod.getWallets();
    for (const wallet of app.get()) {
      tryAdd(wallet);
    }

    const offRegister = app.on("register", (...wallets) => {
      for (const wallet of wallets) {
        tryAdd(wallet);
      }
    });
    internalUnsub = () => offRegister();
  })();

  return () => {
    cancelled = true;
    internalUnsub?.();
    internalUnsub = null;
  };
};

export { discoverSvmAdapters };
