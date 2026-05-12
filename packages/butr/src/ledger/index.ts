// `butr/ledger` — Ledger hardware wallet adapter (WebUSB transport).
//
// Requires two optional peer deps:
//   - `@ledgerhq/hw-app-eth`
//   - `@ledgerhq/hw-transport-webusb`
//
// Install only when this subpath is imported.
//
// Usage:
//
// ```ts
// import { createLedgerAdapter } from "butr/ledger";
//
// const ledger = await createLedgerAdapter({
//   chainId: 1,
//   accountCount: 3,
// });
// ```

export type {
  EthAppConstructor,
  EthAppLike,
  LedgerOptions,
  TransportFactory,
  TransportLike,
} from "./adapter";
export { LEDGER_DEFAULT_ICON, createLedgerAdapter } from "./adapter";
