# Unified `WalletManagerProvider` — design

## Context

Today butr ships two providers: `WalletManagerProvider` (in `@butr/react`,
protocol-free, manual `config.createConnector` seam) and
`AutoWalletManagerProvider` (in `@butr/wallets`, composes EVM + SVM discovery).
Users find two components for "the same thing" confusing, and the manual one
forces ~30 lines of `DiscoverySubscriber` boilerplate in every EVM-only app.

The split exists for a real reason: `@butr/react` must not import
`@butr/evm`/`@butr/svm`, so an EVM-only app never bundles Solana / Wallet
Standard. Any merge must preserve that strict bundle guarantee.

Goal: a single `WalletManagerProvider` with flat props, where **discovery is a
value you pass in** (a `WalletSource`). The protocol dependency travels with the
imported discovery value and tree-shakes by import, not by which component you
pick. "Manual" becomes "don't pass `discovery`." Discovery and an explicit
`createConnector` compose.

Scope decision (user): implement on the current branch `butr-fumadocs-site`
alongside the unmerged docs PR (#12); update all docs in the same pass.

## Approach

Discovery-as-value, one component (chosen over: re-exporting the same name
pre-wired from `@butr/wallets`, and a `mode` prop — both keep an import-path or
prop switch that's less clean and risk the bundle guarantee).

## Library changes

### `@butr/core`

- Add `createWalletSource(subscribe)` — a one-line, protocol-free helper that
  wraps a `(onAdapter) => () => void` function into a `WalletSource`. Lets an
  EVM-only app write `createWalletSource(discoverEvmAdapters)` without importing
  anything protocol-bearing beyond `@butr/evm` itself.
- `WalletManagerConfig` stays exported from core (the store consumes it) but is
  no longer the provider's public prop surface.

### `@butr/react`

- `WalletManagerProvider` gains flat props and absorbs discovery:

  ```ts
  type WalletManagerProviderProps = {
    children: React.ReactNode;
    discovery?: WalletSource;
    connectors?: Array<ConnectorMeta>;
    createConnector?: (id: string) => WalletAdapter | null;
    onConnect?: WalletManagerConfig["onConnect"];
    onConnectError?: WalletManagerConfig["onConnectError"];
    onDisconnect?: WalletManagerConfig["onDisconnect"];
    onHydrated?: WalletManagerConfig["onHydrated"];
    onReset?: WalletManagerConfig["onReset"];
    onSlowConnect?: WalletManagerConfig["onSlowConnect"];
    onStorageError?: WalletManagerConfig["onStorageError"];
    slowConnectThresholdMs?: WalletManagerConfig["slowConnectThresholdMs"];
    storage?: WalletManagerConfig["storage"];
    storageKeyPrefix?: WalletManagerConfig["storageKeyPrefix"];
  };
  ```

- Internally the provider assembles a `WalletManagerConfig` once on mount:
  - keeps an internal `Map<string, WalletAdapter>` of discovered adapters;
  - `createConnector = (id) => discovered.get(id) ?? props.createConnector?.(id) ?? null`
    (resolution rule: discovered first, then explicit factory);
  - `connectors: props.connectors ?? []`;
  - lifecycle/storage props passed straight through.
- If `discovery` is provided, a child subscriber component (inside the store
  context, same shape as today's `DiscoverySubscriber`) calls
  `discovery.subscribe(onAdapter)`, and per announced adapter: dedupes into the
  Map, appends to a discovered-list state, and calls
  `store.getState()._tryRestoreFromPending(adapter.id)` (the hydration glue).
- `useDiscoveredWallets()` **moves to `@butr/react`**, reading the provider's
  discovered-list context. Returns `ReadonlyArray<WalletAdapter>`. When no
  `discovery` is passed it returns `[]`.
- Store creation, single-hydration `useEffect`, `WalletStoreContext`,
  `useWalletStoreContext` unchanged.

### `@butr/wallets`

- Remove `AutoWalletManagerProvider` and the `@butr/react`-re-export of
  `useDiscoveredWallets`.
- Add `autoDiscovery(options?: DiscoverOptions): WalletSource` — thin wrapper
  over the existing `createDiscoveryWalletSource()` / `discoverWalletAdapters`,
  honouring `DiscoverOptions` (`{ evm?, svm?, injected? }`). Keep exporting
  `createDiscoveryWalletSource`, `discoverWalletAdapters`,
  `resolveDiscoverOptions`, `createDiscoveryBus`, `CHAINS*`, `DiscoverOptions`.

## Call sites (the API after)

```tsx
// batteries-included (EVM + SVM)
import { WalletManagerProvider } from "@butr/react";
import { autoDiscovery } from "@butr/wallets";
<WalletManagerProvider discovery={autoDiscovery()} storageKeyPrefix="app">

// EVM-only — no @butr/svm / @butr/wallets in the bundle
import { WalletManagerProvider } from "@butr/react";
import { createWalletSource } from "@butr/core";
import { discoverEvmAdapters } from "@butr/evm";
<WalletManagerProvider discovery={createWalletSource(discoverEvmAdapters)}>

// composed: auto-discover injected + explicit WalletConnect
<WalletManagerProvider
  discovery={autoDiscovery()}
  connectors={[{ id: wc.id, name: wc.name, chainPlatform: "evm" }]}
  createConnector={(id) => extra.get(id) ?? null}
>

// fully manual (no discovery import at all)
<WalletManagerProvider createConnector={(id) => myAdapters.get(id) ?? null}>
```

## Ripple

- **Demos (9):** every `apps/*/src/wallet-provider.tsx`. Batteries-included
  (`demo-vite`, `demo-expo-web`) → `discovery={autoDiscovery()}` (expo keeps its
  `WalletStorage`). Manual EVM (`demo-next`, `demo-tanstack-start`,
  `demo-with-viem`, `demo-with-wagmi`) → drop `DiscoverySubscriber` + custom
  context; use `createWalletSource(discoverEvmAdapters)` and the package's
  `useDiscoveredWallets` from `@butr/react`. Solana demos
  (`demo-with-solana-*`) → `createWalletSource(discoverSvmAdapters)`.
- **Docs:** `concepts/connectors-and-wallets`, `concepts/hydration`,
  `guides/provider-setup`, `frameworks/{vite,nextjs,tanstack-start,expo}`,
  `getting-started/{installation,quickstart}`, `connectors/*` (registration
  examples now compose), `integrations/*` (provider snippets), `api/react`,
  `api/wallets`, `api/core` (add `createWalletSource`), `index`. Code samples
  re-derived from the updated demos; source citations kept.
- **Tests:** `packages/react` (provider/`useDiscoveredWallets`),
  `packages/wallets` (`autoDiscovery`, removed provider). Use `@butr/testing`
  fakes; add a `WalletSource` fake if needed.

## Verification

1. `pnpm install && pnpm build` (full Turborepo) green.
2. `pnpm lint`, `pnpm typecheck`, `pnpm test` green for touched packages
   (`@butr/core`, `@butr/react`, `@butr/wallets`, all demos).
3. EVM-only bundle check: build `demo-next` (or `demo-with-viem`) and confirm no
   `@butr/svm` / Wallet Standard code in the client bundle (grep the build
   output / inspect chunk for `@wallet-standard`).
4. `apps/docs` builds; smoke-test `/docs/guides/provider-setup` and a frameworks
   page; doc snippets match the updated demo source.
5. Manually reason through composed mode: discovered id resolves before
   `createConnector`; explicit-only and discovery-only still work; no-discovery
   returns empty `useDiscoveredWallets()`.

## Out of scope

No behaviour change to the store/reducer, persistence, or error model. No new
discovery protocols. Branch/PR strategy: single branch `butr-fumadocs-site`
(per user) — library + demos + docs in one set of changes.
