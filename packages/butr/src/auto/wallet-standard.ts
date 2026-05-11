import type { WalletAdapter } from "../types";

/**
 * Subscribe to Solana Wallet Standard announcements.
 * Spec: https://github.com/wallet-standard/wallet-standard
 *
 * **STATUS: stub.** Auto-discovery of Solana wallets is not implemented
 * yet. The function returns a no-op unsubscribe so callers can wire it
 * into `discoverWalletAdapters` without conditional branching, but no
 * adapters are produced.
 *
 * **Why deferred**
 *
 *  - Wallet Standard discovery requires either a peer dependency on
 *    `@wallet-standard/app` (its `getWallets()` registry exposes the
 *    `register` event we'd subscribe to) or a hand-rolled equivalent
 *    that listens for the `wallet-standard:app-ready` /
 *    `wallet-standard:register-wallet` events directly. Adding a peer
 *    dep is a non-trivial change for butr; doing it without solid
 *    real-wallet fixtures is premature.
 *
 *  - The adapter generation is also more involved than EIP-6963:
 *    Wallet Standard wallets expose capability *feature* objects
 *    (`standard:connect`, `solana:signMessage`, `solana:signTransaction`,
 *    `standard:events`, etc.). Each has to be detected and bridged into
 *    butr's `WalletAdapter` shape with careful capability gating —
 *    wallets that don't expose `solana:signTransaction` shouldn't
 *    advertise `sendTx`. Real fixtures (Phantom, Solflare, Backpack)
 *    are needed to validate this.
 *
 * **Workaround until this lands**
 *
 *  Solana wallets can still be wired into butr manually via
 *  `WalletManagerConfig.createConnector`, the same way they are today.
 *  EVM-side auto-discovery via EIP-6963 is unaffected — wallets that
 *  announce both EVM and Solana surfaces (e.g. Phantom) will appear
 *  in the EVM discovery list automatically.
 */
const discoverSvmAdapters = (_onAdapter: (adapter: WalletAdapter) => void): (() => void) => {
  return () => {};
};

export { discoverSvmAdapters };
