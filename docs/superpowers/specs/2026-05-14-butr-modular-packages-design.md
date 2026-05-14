# butr modular packages

**Status:** Draft — pending implementation plan
**Date:** 2026-05-14
**Author:** Pedro Filho (with Claude)

## Goal

Make butr modular so users install only the Interface they need, while keeping the core Module small and easy to test. `WalletAdapter` remains the main external seam; protocol-specific implementations are optional adapter packages.

This is a creation-phase rewrite of `packages/butr`. The library is at 0.1.0 with no production install base, so there is no compatibility window to preserve and no `butr` umbrella package after the split — every consumer of every demo installs the modular packages directly.

## Target package graph

```
@butr/core          types, store, reducer, hydration, storage, WalletSource type
@butr/react         WalletManagerProvider + hooks (sync + async)
@butr/evm           EIP-1193, EIP-6963, injected fallback, EVM chains, EVM capabilities
@butr/svm           Wallet Standard adapter, SVM chains, SVM capabilities
@butr/walletconnect WalletConnect adapter + capabilities
@butr/ledger        Ledger adapter + capabilities
@butr/wallets       Discovery composition (EVM + SVM) behind WalletSource; AutoWalletManagerProvider
@butr/testing       Fake adapters, memory storage, provider test helpers
```

The legacy `packages/butr` directory is deleted at the end of the migration.

### Dependency rules

- `@butr/core` must not depend on React, EVM, SVM, Ledger, WalletConnect, or browser discovery. Pure types + state + storage primitives.
- `@butr/react` depends only on `@butr/core`, `react`, and `zustand`.
- `@butr/evm`, `@butr/svm`, `@butr/walletconnect`, and `@butr/ledger` depend on `@butr/core` only.
- `@butr/wallets` depends on `@butr/core`, `@butr/evm`, and `@butr/svm`. It may optionally compose `@butr/walletconnect` / `@butr/ledger` later.
- `@butr/testing` depends on `@butr/core` only.
- `react` stays a peer dependency on every package that touches React. Protocol SDKs (`@ledgerhq/*`, `@walletconnect/universal-provider`, `@wallet-standard/app`) are normal dependencies of the opt-in adapter package that needs them, not optional peers of an umbrella.

## Core seams

### WalletAdapter (unchanged)

`WalletAdapter = Connector & Wallet` (see `packages/butr/src/types/wallet.ts:216`). The split is documentary: `Connector` is what butr's runtime calls, `Wallet` is what consumers call on a connected wallet. Every protocol-specific adapter satisfies this type.

This type moves to `@butr/core` and is the single nominal source. All other packages import it from there — never re-declare. This is the primary defence against type-identity splits.

### WalletSource (new)

```ts
// @butr/core
type WalletSource = {
  subscribe(onAdapter: (adapter: WalletAdapter) => void): () => void;
};
```

A discovery seam. Implementations push `WalletAdapter` values into `onAdapter` each time they find one and return an unsubscribe handle. `@butr/wallets` composes EVM + SVM into a single `WalletSource`; third parties (custom enterprise sources, future hardware-wallet packages) can implement the type without depending on `@butr/wallets`.

The type lives in `@butr/core` precisely so that implementations carry no transitive dependency on the composition package.

### WalletCapabilities (split per adapter)

Today `packages/butr/src/capabilities.ts` fans four transports through one `resolveCapabilities(input)` switch. After the split:

- `@butr/evm` exports `resolveEip6963Capabilities({ rdns })` and the `EIP6963_RDNS_WITH_REQUEST_ACCOUNTS` allow-list.
- `@butr/svm` exports `resolveWalletStandardCapabilities({ chainCount, features })`.
- `@butr/walletconnect` and `@butr/ledger` build their capability objects inline (each transport has a single fixed shape).
- `@butr/core` exports the `WalletCapabilities` *type* only — no resolver, no transport union.

This keeps `@butr/core` agnostic of every transport and lets each adapter package own the heuristics that decide its own capability flags.

## Package contents

### `@butr/core`

Moves from `packages/butr/src/`:

- `types/wallet.ts` (Account, Balance, Connector, Wallet, WalletAdapter, ConnectedWallet, ConnectorMeta, WalletCapabilities, ConnectorEvent, HydrationOutcome, WalletManagerConfig, ChainPlatform, WalletAvailability)
- `types/chain.ts` (ChainBase)
- `types/errors.ts` (ConnectionError, ConnectionErrorKind, mapConnectionError)
- `store/wallet-store.ts`, `store/reducer.ts`, `store/hydration.ts`, `store/connector-lifecycle.ts`, `store/wallet-store-helpers.ts`
- `storage/persistence.ts`, `storage/wallet-storage.ts`, `storage/browser-storage-driver.ts`, `storage/cookie-storage-driver.ts`, memory storage driver
- `wallet-equal.ts` (equality helper used by `@butr/react` async hooks)

Adds:

- `WalletSource` type (see above)

### `@butr/react`

Moves from `packages/butr/src/`:

- `context.tsx` — `WalletManagerProvider` (manual mode only after the split — see below), `useWalletStoreContext`
- `hooks.ts` — all sync selectors and action hooks
- `hooks-async.ts` — `useSigner`, `useBalance`, `useWalletEntry`, `useAsyncResource`

Does **not** include auto-discovery wiring. The `auto` prop branch of `WalletManagerProvider` and `useDiscoveredWallets` move to `@butr/wallets` as a wrapper component.

`@butr/react` exports only the manual `WalletManagerProvider` (the `ManualProviderProps` shape today). Its prop is just `{ config: WalletManagerConfig, children }`.

### `@butr/evm`

Moves from `packages/butr/src/auto/`:

- `eip1193.ts` (types: Eip1193Provider, Eip1193Listener, Eip1193RequestArgs, EIP-6963 announce/request types)
- `eip6963.ts` (`discoverEvmAdapters`, ANNOUNCE_EVENT, REQUEST_EVENT)
- `eip6963-adapter.ts` (`buildEvmAdapter`, hex/decimal/byte/ether helpers)
- `injected.ts` (`discoverInjectedAdapter`, `GENERIC_INJECTED_ICON`, `InjectedDiscoveryOptions`)

From `packages/butr/src/`:

- `EVM_CHAINS` (from `chains.ts`)
- EVM-side capability resolver (extracted from `capabilities.ts`)

### `@butr/svm`

Moves from `packages/butr/src/auto/`:

- `wallet-standard.ts` (`discoverSvmAdapters`)
- `wallet-standard-types.ts` (all Wallet Standard / Solana feature types)
- `wallet-standard-adapter.ts` (`buildSvmAdapter`, `slugify`)

From `packages/butr/src/`:

- `SVM_CHAINS` (from `chains.ts`)
- SVM-side capability resolver (extracted from `capabilities.ts`)

### `@butr/walletconnect`

Moves from `packages/butr/src/walletconnect/`:

- `adapter.ts`, `index.ts` (existing subpath, lifted verbatim into a standalone package)
- WalletConnect capability builder (inline, replacing the `walletconnect` case in `capabilities.ts`)

### `@butr/ledger`

Moves from `packages/butr/src/ledger/`:

- `adapter.ts`, `index.ts` (existing subpath, lifted verbatim)
- Ledger capability builder (inline, replacing the `ledger` case in `capabilities.ts`)

### `@butr/wallets`

Moves from `packages/butr/src/auto/`:

- `discovery-bus.ts`
- `discover.ts` (`discoverWalletAdapters`, `resolveDiscoverOptions`, `DiscoverOptions`)

Adds:

- A React convenience wrapper (working name `AutoWalletManagerProvider`) that internally calls `discoverWalletAdapters`, populates an adapters Map, and renders `<WalletManagerProvider>` from `@butr/react` with a `createConnector` closure over that Map. This is the same code path as today's `<WalletManagerProvider auto>` — relocated, not rewritten.
- A `WalletSource` implementation that wraps `discoverWalletAdapters` so consumers who want to drive their own provider but still use butr's discovery have a clean entry point.
- Re-export of `useDiscoveredWallets` (the context provider for the discovered list moves here alongside `AutoWalletManagerProvider`).

`@butr/wallets` depends on `@butr/core`, `@butr/react`, `@butr/evm`, and `@butr/svm`.

### `@butr/testing`

Extracted from `packages/butr/src/__tests__/helpers.ts` and adjacent test files. Concrete contents:

- Fake `WalletAdapter` factory (mock connector + mock wallet methods, configurable per test)
- Fake `WalletPersistence` (in-memory, mirrors the on-disk shape)
- Mock chains / accounts / addresses
- Provider test helper that renders `<WalletManagerProvider>` with a configurable store seed

Depends on `@butr/core` only (no React peer — consumers wire it into their own renderer).

## Data flow

### Manual mode (every demo except demo-vite)

```
consumer creates WalletManagerConfig
   ↓
<WalletManagerProvider config={...}> from @butr/react
   ↓
zustand store, hydration, hooks
   ↓
consumer calls useConnectWallet(id) → store calls config.createConnector(id) → returns a WalletAdapter from @butr/evm / @butr/svm / @butr/walletconnect / @butr/ledger / user code
```

### Auto mode (demo-vite)

```
<AutoWalletManagerProvider> from @butr/wallets
   ↓ (internally)
discoverWalletAdapters() — runs @butr/evm + @butr/svm discovery paths
   ↓
each announced WalletAdapter → adapters Map + useDiscoveredWallets() context
   ↓
<WalletManagerProvider config={{ connectors: [], createConnector: (id) => adapters.get(id) }}> from @butr/react
   ↓
same hooks as manual mode
```

The reactive discovery → store path is unchanged from today; the only difference is which package owns each piece.

## Demo matrix

| Demo | Packages | Purpose |
| --- | --- | --- |
| `demo-vite` | `@butr/wallets`, `@butr/react` | Batteries-included browser. Single import + `<AutoWalletManagerProvider>` and a wallet picker. |
| `demo-next` | `@butr/react`, `@butr/evm` | EVM-only manual wiring. Proves you can ship without SVM in the bundle. |
| `demo-tanstack-start` | `@butr/core`, `@butr/react`, `@butr/evm` | Manual wiring with a real EVM adapter (no auto-discovery). Proves the `WalletManagerConfig.createConnector` path. |
| `demo-expo` | `@butr/core`, `@butr/react`, AsyncStorage driver | RN demo. Includes a tiny `@react-native-async-storage/async-storage` storage driver (lives in the demo, not exported from butr) so sessions survive reload. |

Each demo's set of installed `@butr/*` packages is the package graph being proven. CI lints the demos to catch accidental cross-package imports (e.g. `demo-next` should not pull `@butr/svm`).

## Testing

### Test relocation

- Store tests → `@butr/core`
- Storage tests → `@butr/core`
- EIP-6963 / injected / EIP-1193 tests → `@butr/evm`
- Wallet Standard tests → `@butr/svm`
- Ledger tests → `@butr/ledger`
- WalletConnect tests → `@butr/walletconnect`
- Discovery bus / combined discovery tests → `@butr/wallets`
- React provider + hook tests → `@butr/react`

### Boundary enforcement

We use TypeScript project references + a smoke test, not a separate lint runner. oxlint has no `import/no-restricted-paths` equivalent and we don't want to introduce ESLint just for this.

- Each `@butr/*` `tsconfig.json` lists exactly the packages it is allowed to depend on under `references`. If `@butr/core/tsconfig.json` references `@butr/react`, `pnpm typecheck` fails.
- A smoke test in `@butr/core` imports `@butr/core` and asserts the resolved module does not pull React or any protocol package into its dependency tree (parsed `require.resolve` / `import.meta.resolve` chain, ~30 LOC).
- `pnpm fallow:dead` catches anything left behind in `packages/butr` during the migration.

### Acceptance

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm fallow:dead
```

All four must pass on `main` after the migration. No new e2e tests are introduced as part of this refactor.

## Migration phases

Each phase is independently mergeable and leaves the repo in a working state (all four acceptance commands green).

1. **Scaffold `@butr/core`** — create `packages/core` with `package.json`, `tsconfig.json`, empty `src/index.ts`. No content yet; just the workspace entry and `pnpm install` clean.
2. **Move types + store + storage into `@butr/core`** — copy `types/`, `store/`, `storage/`, `wallet-equal.ts` from `packages/butr/src/`. Add the `WalletSource` type. Update `packages/butr/src/` to re-export from `@butr/core` temporarily *within the monorepo* (no published re-exports — this is purely so the rest of the migration phases compile against an intermediate state). Move corresponding tests.
3. **Scaffold `@butr/react`** — `packages/react` with `package.json`, `tsconfig.json`.
4. **Move provider + hooks into `@butr/react`** — `context.tsx`, `hooks.ts`, `hooks-async.ts`. Strip the `auto` prop branch from `WalletManagerProvider` (it moves to `@butr/wallets`). `useDiscoveredWallets` moves with it.
5. **Scaffold `@butr/evm`** — extract `eip1193.ts`, `eip6963.ts`, `eip6963-adapter.ts`, `injected.ts`, the EVM capability resolver, and `EVM_CHAINS`.
6. **Scaffold `@butr/svm`** — extract `wallet-standard*.ts`, the SVM capability resolver, and `SVM_CHAINS`.
7. **Scaffold `@butr/walletconnect`** — lift `packages/butr/src/walletconnect/` verbatim, add inline capability builder, replace the WalletConnect case in `capabilities.ts`.
8. **Scaffold `@butr/ledger`** — lift `packages/butr/src/ledger/` verbatim, add inline capability builder, replace the Ledger case in `capabilities.ts`.
9. **Scaffold `@butr/wallets`** — move `discovery-bus.ts`, `discover.ts`, port the `auto` prop branch into `AutoWalletManagerProvider`, expose the `WalletSource` implementation.
10. **Scaffold `@butr/testing`** — extract reusable test helpers from `__tests__/helpers.ts` and adjacent files.
11. **Update demos** — switch each demo to the package set in the matrix above. Add the AsyncStorage driver in `demo-expo`.
12. **Delete `packages/butr`** — final acceptance pass.
13. **Boundary checks** — add tsconfig project references + the smoke test. Wire into `pnpm typecheck` / `pnpm test`.

Phases 5–10 can be parallelised; the others have ordering constraints (3 before 4, 4 before 9).

## Open risks

- **Type identity** — every adapter package must import shared types from `@butr/core` and never re-declare. Mitigated by phase 1 making `@butr/core` the only home for `WalletAdapter` and friends, and by the boundary smoke test rejecting cross-package type duplication.
- **Circular deps** — `@butr/react` must not depend on `@butr/wallets`. Auto-discovery wrappers live in `@butr/wallets`, where the dependency direction is `wallets → react`, not the other way. Phase 9 is the only place this could regress.
- **Async hook drift** — `hooks-async.ts` keeps `useSigner`/`useBalance`/`useWalletEntry` and `useAsyncResource`. Reconsider after the modular packages settle; this spec does not commit to a post-extraction reshaping.
- **Capability resolver duplication** — splitting `resolveCapabilities` across four packages means four small functions instead of one switch. Acceptable: each transport's mapping is fixed (EIP-6963: 8 flags from `rdns`; Wallet Standard: 8 flags from feature advertisements; WalletConnect: 8 constants; Ledger: 8 constants). No cross-transport invariant exists that justified the shared switch.

## Out of scope

- WalletConnect / Ledger composition inside `@butr/wallets` (mentioned as a future option, not part of this migration).
- Reshaping `hooks-async.ts` or reducing hook count in `@butr/react` (deferred to a follow-up after the package graph stabilises).
- A `@butr/wallets/wagmi` adapter or any other interop layer.
- Publishing to npm — this spec covers the workspace migration only. A separate spec covers the first publish.
