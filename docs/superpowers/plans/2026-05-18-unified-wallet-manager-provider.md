# Unified `WalletManagerProvider` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge `AutoWalletManagerProvider` into a single flat-prop `WalletManagerProvider` where discovery is a `WalletSource` value passed in, preserving the strict EVM-only bundle guarantee.

**Architecture:** `@butr/react` stays protocol-free; its `WalletManagerProvider` gains flat props, an internal discovered-adapter map, a `discovery` subscription, and owns `useDiscoveredWallets()`. `@butr/wallets` exports `autoDiscovery()` (a `WalletSource`) and drops its provider. `@butr/core` adds a one-line `createWalletSource` helper.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest + @testing-library/react, `@butr/testing` fakes, pnpm + Turborepo, oxlint/oxfmt.

**Working dir:** repo root `/Users/pedroapfilho/conductor/workspaces/butr-monorepo/marseille` (worktree of `butr-monorepo`). Branch: `butr-fumadocs-site`.

**Conventions:** arrow fns, `export` at end, `types` over `interfaces`, kebab-case files. Run `pnpm --filter <pkg> test` / `pnpm turbo run typecheck lint --filter <pkg>` after each package. oxlint enforces alphabetical object keys + JSX props + `Array<T>` + `curly`.

---

## Phase A — `@butr/core`: `createWalletSource`

### Task A1: Add `createWalletSource` helper

**Files:**
- Modify: `packages/core/src/wallet-source.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/__tests__/wallet-source.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/__tests__/wallet-source.test.ts
import { describe, expect, it, vi } from "vitest";
import { createWalletSource } from "../wallet-source";

describe("createWalletSource", () => {
  it("wraps a subscribe fn into a WalletSource and forwards unsubscribe", () => {
    const unsub = vi.fn();
    const subscribe = vi.fn(() => unsub);
    const source = createWalletSource(subscribe);
    const onAdapter = vi.fn();
    const returned = source.subscribe(onAdapter);
    expect(subscribe).toHaveBeenCalledWith(onAdapter);
    returned();
    expect(unsub).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @butr/core test -- wallet-source`
Expected: FAIL — `createWalletSource` is not exported.

- [ ] **Step 3: Implement**

Replace `packages/core/src/wallet-source.ts` with:

```ts
import type { WalletAdapter } from "./types";

/**
 * A discovery seam. Implementations call `onAdapter(adapter)` each time
 * they find a wallet and return an unsubscribe handle. `@butr/wallets`
 * composes EVM + SVM into a single `WalletSource`; third parties can
 * implement this type without depending on `@butr/wallets`.
 */
type WalletSource = {
  subscribe(onAdapter: (adapter: WalletAdapter) => void): () => void;
};

/**
 * Wrap a bare `subscribe` function (the exact shape of
 * `discoverEvmAdapters` / `discoverSvmAdapters`) into a `WalletSource`,
 * so an EVM-only app can do
 * `createWalletSource(discoverEvmAdapters)` without importing anything
 * protocol-bearing beyond `@butr/evm`.
 */
const createWalletSource = (
  subscribe: (onAdapter: (adapter: WalletAdapter) => void) => () => void,
): WalletSource => ({ subscribe });

export type { WalletSource };
export { createWalletSource };
```

In `packages/core/src/index.ts`, find the discovery-seam export line:

```ts
// Discovery seam
export type { WalletSource } from "./wallet-source";
```

Replace it with:

```ts
// Discovery seam
export type { WalletSource } from "./wallet-source";
export { createWalletSource } from "./wallet-source";
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @butr/core test -- wallet-source`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint + commit**

Run: `pnpm turbo run typecheck lint --filter=@butr/core` → expect pass.

```bash
git add packages/core/src/wallet-source.ts packages/core/src/index.ts packages/core/src/__tests__/wallet-source.test.ts
git commit -m "feat(core): add createWalletSource helper"
```

---

## Phase B — `@butr/react`: unified provider + `useDiscoveredWallets`

### Task B1: Rewrite `WalletManagerProvider` with flat props + discovery

**Files:**
- Modify: `packages/react/src/context.tsx`
- Modify: `packages/react/src/index.ts`
- Test: `packages/react/src/__tests__/context.test.tsx` (rewrite)
- Test helper: `packages/react/src/__tests__/render-with-provider.tsx` (modify)

- [ ] **Step 1: Update the test helper to flat props**

Replace `packages/react/src/__tests__/render-with-provider.tsx` with:

```tsx
import React, { type PropsWithChildren, type ReactElement } from "react";
import { render, renderHook, type RenderHookOptions } from "@testing-library/react";
import type { WalletAdapter, WalletManagerConfig, WalletPersistence } from "@butr/core";
import { createFakePersistence } from "@butr/testing";
import { WalletManagerProvider } from "../context";

type ConfigOpts = {
  adapters?: ReadonlyArray<WalletAdapter>;
  config?: Partial<WalletManagerConfig>;
  storage?: WalletPersistence;
};

const buildConfig = ({
  adapters = [],
  config = {},
  storage,
}: ConfigOpts = {}): WalletManagerConfig => {
  const byId = new Map<string, WalletAdapter>(adapters.map((a) => [a.id, a]));
  return {
    connectors: [],
    createConnector: (id) => byId.get(id) ?? null,
    storage: storage ?? createFakePersistence(),
    ...config,
  };
};

/** Translate an internal WalletManagerConfig into the provider's flat props. */
const configToProps = (config: WalletManagerConfig) => ({
  connectors: config.connectors,
  createConnector: config.createConnector,
  onConnect: config.onConnect,
  onConnectError: config.onConnectError,
  onDisconnect: config.onDisconnect,
  onHydrated: config.onHydrated,
  onReset: config.onReset,
  onSlowConnect: config.onSlowConnect,
  slowConnectThresholdMs: config.slowConnectThresholdMs,
  onStorageError: config.onStorageError,
  storage: config.storage,
  storageKeyPrefix: config.storageKeyPrefix,
});

const renderWithProvider = (ui: ReactElement, opts: ConfigOpts = {}) => {
  const config = buildConfig(opts);
  const wrapper = ({ children }: PropsWithChildren) => (
    <WalletManagerProvider {...configToProps(config)}>{children}</WalletManagerProvider>
  );
  return { config, ...render(ui, { wrapper }) };
};

const renderHookWithProvider = <T,>(
  hook: () => T,
  opts: ConfigOpts & Omit<RenderHookOptions<unknown>, "wrapper"> = {},
) => {
  const { adapters, config: configOverrides, storage, ...rest } = opts;
  const config = buildConfig({ adapters, config: configOverrides, storage });
  const wrapper = ({ children }: PropsWithChildren) => (
    <WalletManagerProvider {...configToProps(config)}>{children}</WalletManagerProvider>
  );
  return { config, ...renderHook(hook, { wrapper, ...rest }) };
};

export type { ConfigOpts };
export { buildConfig, configToProps, renderHookWithProvider, renderWithProvider };
```

- [ ] **Step 2: Write the failing provider test**

Replace `packages/react/src/__tests__/context.test.tsx` with:

```tsx
import React, { type PropsWithChildren } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WalletAdapter, WalletSource } from "@butr/core";
import { createFakeAdapter, createFakePersistence } from "@butr/testing";
import {
  WalletManagerProvider,
  useDiscoveredWallets,
  useWalletStoreContext,
} from "../context";
import { useConnectWallet, useConnectedWallets } from "../hooks";

const sourceOf = (...adapters: Array<WalletAdapter>): WalletSource => ({
  subscribe: (onAdapter) => {
    for (const a of adapters) onAdapter(a);
    return () => {};
  },
});

const wrap =
  (props: Partial<React.ComponentProps<typeof WalletManagerProvider>>) =>
  ({ children }: PropsWithChildren) => (
    <WalletManagerProvider storage={createFakePersistence()} {...props}>
      {children}
    </WalletManagerProvider>
  );

describe("WalletManagerProvider (unified)", () => {
  it("hydrates and provides the store", async () => {
    const { result } = renderHook(() => useWalletStoreContext(), {
      wrapper: wrap({}),
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.getState().isHydrated).toBe(true);
  });

  it("useDiscoveredWallets is empty without a discovery prop", () => {
    const { result } = renderHook(() => useDiscoveredWallets(), { wrapper: wrap({}) });
    expect(result.current).toEqual([]);
  });

  it("populates useDiscoveredWallets from the discovery WalletSource", async () => {
    const adapter = createFakeAdapter({ id: "fake-evm" });
    const { result } = renderHook(() => useDiscoveredWallets(), {
      wrapper: wrap({ discovery: sourceOf(adapter) }),
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.map((a) => a.id)).toEqual(["fake-evm"]);
  });

  it("resolves discovered id before falling back to createConnector", async () => {
    const discovered = createFakeAdapter({ id: "dup" });
    const fallback = vi.fn(() => null);
    const { result } = renderHook(
      () => ({ connect: useConnectWallet(), connected: useConnectedWallets() }),
      { wrapper: wrap({ discovery: sourceOf(discovered), createConnector: fallback }) },
    );
    await act(async () => {
      await Promise.resolve();
      await result.current.connect("dup");
    });
    expect(fallback).not.toHaveBeenCalledWith("dup");
    expect(result.current.connected.map((w) => w.connector.id)).toContain("dup");
  });

  it("uses createConnector when discovery has no match", async () => {
    const manual = createFakeAdapter({ id: "manual" });
    const { result } = renderHook(
      () => ({ connect: useConnectWallet(), connected: useConnectedWallets() }),
      { wrapper: wrap({ createConnector: (id) => (id === "manual" ? manual : null) }) },
    );
    await act(async () => {
      await Promise.resolve();
      await result.current.connect("manual");
    });
    expect(result.current.connected.map((w) => w.connector.id)).toContain("manual");
  });

  it("forwards onHydrated", async () => {
    const onHydrated = vi.fn();
    renderHook(() => null, { wrapper: wrap({ onHydrated }) });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onHydrated).toHaveBeenCalledTimes(1);
  });
});

describe("useDiscoveredWallets outside provider", () => {
  it("returns empty array", () => {
    const { result } = renderHook(() => useDiscoveredWallets());
    expect(result.current).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test, verify it fails**

Run: `pnpm --filter @butr/react test -- context`
Expected: FAIL — `useDiscoveredWallets` not exported from `../context`; `WalletManagerProvider` has no `discovery` prop.

- [ ] **Step 4: Implement the unified provider**

Replace `packages/react/src/context.tsx` with:

```tsx
import React, { createContext, use, useEffect, useMemo, useRef, useState } from "react";
import type {
  ConnectorMeta,
  WalletAdapter,
  WalletManagerConfig,
  WalletSource,
} from "@butr/core";
import { type WalletStore, createWalletStore } from "@butr/core";

const WalletStoreContext: React.Context<WalletStore | null> =
  createContext<WalletStore | null>(null);

const EMPTY_DISCOVERED: ReadonlyArray<WalletAdapter> = [];
const DiscoveredWalletsContext: React.Context<ReadonlyArray<WalletAdapter>> =
  createContext<ReadonlyArray<WalletAdapter>>(EMPTY_DISCOVERED);

type WalletManagerProviderProps = {
  children: React.ReactNode;
  /** Metadata for explicitly-registered connectors. */
  connectors?: Array<ConnectorMeta>;
  /** Explicit/manual connector factory. Resolved after `discovery`. */
  createConnector?: (id: string) => WalletAdapter | null;
  /** Auto-discovery source. Omit for a fully-manual provider (no
   *  protocol code enters the bundle). */
  discovery?: WalletSource;
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

/**
 * The butr provider. Pass `discovery` (a `WalletSource` such as
 * `autoDiscovery()` from `@butr/wallets`) for auto-discovered wallets,
 * and/or `createConnector` to register explicit adapters
 * (WalletConnect, Ledger, custom). When both are present an id is
 * resolved from discovered adapters first, then `createConnector`.
 *
 * The store and the discovery subscription are created once for the
 * provider's lifetime; props captured at mount are authoritative.
 */
const WalletManagerProvider: React.FC<WalletManagerProviderProps> = (props) => {
  const { children } = props;
  const [adapters] = useState<Map<string, WalletAdapter>>(() => new Map());
  const [discoveredList, setDiscoveredList] =
    useState<ReadonlyArray<WalletAdapter>>(EMPTY_DISCOVERED);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- captured once on mount
  const initialConfig = useMemo<WalletManagerConfig>(() => {
    const userCreate = props.createConnector;
    return {
      connectors: props.connectors ?? [],
      createConnector: (id) => adapters.get(id) ?? userCreate?.(id) ?? null,
      onConnect: props.onConnect,
      onConnectError: props.onConnectError,
      onDisconnect: props.onDisconnect,
      onHydrated: props.onHydrated,
      onReset: props.onReset,
      onSlowConnect: props.onSlowConnect,
      onStorageError: props.onStorageError,
      slowConnectThresholdMs: props.slowConnectThresholdMs,
      storage: props.storage,
      storageKeyPrefix: props.storageKeyPrefix,
    };
  }, []);
  const [store] = useState(() => createWalletStore(initialConfig));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- captured once on mount
  const discovery = useMemo<WalletSource | undefined>(() => props.discovery, []);
  const hasHydratedRef = useRef(false);

  useEffect(() => {
    if (hasHydratedRef.current) {
      return;
    }
    hasHydratedRef.current = true;
    const state = store.getState();
    void (async () => {
      try {
        await state._hydrateWallets();
      } catch (error: unknown) {
        console.error("[butr] failed to hydrate wallets:", error);
      }
    })();
  }, [store]);

  useEffect(() => {
    if (!discovery) {
      return;
    }
    const unsubscribe = discovery.subscribe((adapter) => {
      if (adapters.has(adapter.id)) {
        return;
      }
      adapters.set(adapter.id, adapter);
      setDiscoveredList((prev) => [...prev, adapter]);
      void store.getState()._tryRestoreFromPending(adapter.id);
    });
    return unsubscribe;
  }, [adapters, discovery, store]);

  return (
    <WalletStoreContext.Provider value={store}>
      <DiscoveredWalletsContext.Provider value={discoveredList}>
        {children}
      </DiscoveredWalletsContext.Provider>
    </WalletStoreContext.Provider>
  );
};

/** Read the store from context. Exported for adapter packages building
 *  custom discovery wiring. */
const useWalletStoreContext = (): WalletStore => {
  const store = use(WalletStoreContext);
  if (!store) {
    throw new Error("useWalletStoreContext must be used within WalletManagerProvider");
  }
  return store;
};

/** Reactive list of wallets announced via the `discovery` source since
 *  the provider mounted. Empty when no `discovery` was passed. */
const useDiscoveredWallets = (): ReadonlyArray<WalletAdapter> =>
  use(DiscoveredWalletsContext);

export type { WalletManagerProviderProps };
export {
  WalletManagerProvider,
  WalletStoreContext,
  useDiscoveredWallets,
  useWalletStoreContext,
};
```

- [ ] **Step 5: Export `useDiscoveredWallets` from the package**

In `packages/react/src/index.ts`, find:

```ts
// Provider
export type { WalletManagerProviderProps } from "./context";
export { WalletManagerProvider, WalletStoreContext, useWalletStoreContext } from "./context";
```

Replace with:

```ts
// Provider
export type { WalletManagerProviderProps } from "./context";
export {
  WalletManagerProvider,
  WalletStoreContext,
  useDiscoveredWallets,
  useWalletStoreContext,
} from "./context";
```

- [ ] **Step 6: Run the full react test suite**

Run: `pnpm --filter @butr/react test`
Expected: PASS — all existing hook tests still green (they go through the updated helper), plus the new `context.test.tsx`.

- [ ] **Step 7: Typecheck + lint**

Run: `pnpm turbo run typecheck lint --filter=@butr/react`
Expected: pass. Fix any oxlint object-key/JSX-prop ordering if flagged.

- [ ] **Step 8: Commit**

```bash
git add packages/react/src/context.tsx packages/react/src/index.ts packages/react/src/__tests__/context.test.tsx packages/react/src/__tests__/render-with-provider.tsx
git commit -m "feat(react): unified flat-prop WalletManagerProvider with discovery + useDiscoveredWallets"
```

---

## Phase C — `@butr/wallets`: `autoDiscovery`, remove provider

### Task C1: Add `autoDiscovery`, drop `AutoWalletManagerProvider`

**Files:**
- Delete: `packages/wallets/src/auto-provider.tsx`
- Create: `packages/wallets/src/auto-discovery.ts`
- Modify: `packages/wallets/src/index.ts`
- Delete: `packages/wallets/src/__tests__/auto-provider.test.tsx`
- Test: `packages/wallets/src/__tests__/auto-discovery.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// packages/wallets/src/__tests__/auto-discovery.test.ts
import { describe, expect, it } from "vitest";
import { autoDiscovery } from "../auto-discovery";

describe("autoDiscovery", () => {
  it("returns a WalletSource whose subscribe returns an unsubscribe fn", () => {
    const source = autoDiscovery({ evm: false, svm: false, injected: false });
    expect(typeof source.subscribe).toBe("function");
    const unsubscribe = source.subscribe(() => {});
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @butr/wallets test -- auto-discovery`
Expected: FAIL — module `../auto-discovery` does not exist.

- [ ] **Step 3: Implement `auto-discovery.ts`**

```ts
// packages/wallets/src/auto-discovery.ts
import type { WalletSource } from "@butr/core";
import { type DiscoverOptions, discoverWalletAdapters } from "./discover";

/**
 * The batteries-included discovery source: composes EVM (EIP-6963 +
 * injected fallback) and SVM (Wallet Standard). Pass to
 * `<WalletManagerProvider discovery={autoDiscovery()} />`. Restrict
 * platforms with `options`, e.g. `autoDiscovery({ evm: true })`.
 */
const autoDiscovery = (options?: DiscoverOptions): WalletSource => ({
  subscribe: (onAdapter) => discoverWalletAdapters(onAdapter, options),
});

export { autoDiscovery };
```

- [ ] **Step 4: Delete the old provider + its test**

```bash
git rm packages/wallets/src/auto-provider.tsx packages/wallets/src/__tests__/auto-provider.test.tsx
```

- [ ] **Step 5: Update `packages/wallets/src/index.ts`**

Replace the file with:

```ts
// Combined chain registries
export { CHAINS, CHAINS_BY_PLATFORM } from "./chains";

// Discovery primitives
export type { DiscoverOptions } from "./discover";
export { discoverWalletAdapters, resolveDiscoverOptions } from "./discover";

export type { DiscoveryBus, DiscoveryPath } from "./discovery-bus";
export { createDiscoveryBus } from "./discovery-bus";

// WalletSource composition
export { createDiscoveryWalletSource } from "./wallet-source";

// Batteries-included discovery source for <WalletManagerProvider discovery=… />
export { autoDiscovery } from "./auto-discovery";
```

- [ ] **Step 6: Run wallets test suite**

Run: `pnpm --filter @butr/wallets test`
Expected: PASS. (The old `auto-provider.test.tsx` is gone; remaining tests — discover, chains, wallet-source, discovery-bus — unaffected.)

- [ ] **Step 7: Typecheck + lint**

Run: `pnpm turbo run typecheck lint --filter=@butr/wallets`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add packages/wallets/src/auto-discovery.ts packages/wallets/src/index.ts packages/wallets/src/__tests__/auto-discovery.test.ts
git commit -m "feat(wallets): export autoDiscovery WalletSource; remove AutoWalletManagerProvider"
```

---

## Phase D — Demo apps (9)

All demo `wallet-provider.tsx` files change to the unified provider. The
`useDiscoveredWallets` import moves from the local provider module / `@butr/wallets`
to `@butr/react`.

### Task D1: Batteries-included demos (`demo-vite`, `demo-expo-web`)

**Files:**
- Modify: `apps/demo-vite/src/wallet-provider.tsx`
- Modify: `apps/demo-vite/src/app.tsx`
- Modify: `apps/demo-expo-web/src/wallet-provider.tsx`

- [ ] **Step 1: `apps/demo-vite/src/wallet-provider.tsx`**

```tsx
import type { ReactNode } from "react";
import { WalletManagerProvider } from "@butr/react";
import { autoDiscovery } from "@butr/wallets";

const WalletProvider = ({ children }: { children: ReactNode }) => (
  <WalletManagerProvider discovery={autoDiscovery()} storageKeyPrefix="butr-demo">
    {children}
  </WalletManagerProvider>
);

export { WalletProvider };
```

- [ ] **Step 2: Fix `useDiscoveredWallets` import in `apps/demo-vite/src/app.tsx`**

Change the import line:

```tsx
import { CHAINS_BY_PLATFORM, useDiscoveredWallets } from "@butr/wallets";
```

to:

```tsx
import { CHAINS_BY_PLATFORM } from "@butr/wallets";
```

and add `useDiscoveredWallets` to the existing `@butr/react` import block (keep that block's imports alphabetically ordered for oxlint: it currently imports `useActiveWallet … useSetActiveConnector` — insert `useDiscoveredWallets` in alphabetical position).

- [ ] **Step 3: `apps/demo-expo-web/src/wallet-provider.tsx`**

```tsx
import type { ReactNode } from "react";
import { WalletStorage } from "@butr/core";
import { WalletManagerProvider } from "@butr/react";
import { autoDiscovery } from "@butr/wallets";
import { asyncStorageDriver } from "./async-storage-driver";

const KEY_PREFIX = "butr-demo";

const storage = new WalletStorage({
  keyPrefix: KEY_PREFIX,
  persistent: asyncStorageDriver,
  session: asyncStorageDriver,
});

const WalletProvider = ({ children }: { children: ReactNode }) => (
  <WalletManagerProvider
    discovery={autoDiscovery()}
    storage={storage}
    storageKeyPrefix={KEY_PREFIX}
  >
    {children}
  </WalletManagerProvider>
);

export { WalletProvider };
```

- [ ] **Step 4: Typecheck both apps**

Run: `pnpm turbo run typecheck lint --filter=demo-vite --filter=demo-expo-web`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/demo-vite/src/wallet-provider.tsx apps/demo-vite/src/app.tsx apps/demo-expo-web/src/wallet-provider.tsx
git commit -m "refactor(demo-vite,demo-expo-web): use unified WalletManagerProvider + autoDiscovery"
```

### Task D2: Manual EVM demos (`demo-next`, `demo-tanstack-start`, `demo-with-viem`, `demo-with-wagmi`)

These drop the entire `DiscoverySubscriber` + custom-context boilerplate. They now
expose `useDiscoveredWallets` by re-exporting from `@butr/react` so consuming
`app.tsx`/`page.tsx` imports stay local-path stable.

**Files:** each app's `src/wallet-provider.tsx` (and `demo-next` is `"use client"`).

- [ ] **Step 1: `apps/demo-next/src/wallet-provider.tsx`**

```tsx
"use client";

import type { ReactNode } from "react";
import { createWalletSource } from "@butr/core";
import { WalletManagerProvider, useDiscoveredWallets } from "@butr/react";
import { discoverEvmAdapters } from "@butr/evm";

// EVM-only: @butr/react + @butr/evm. No @butr/svm / @butr/wallets in the
// bundle — discovery is a WalletSource built from the EVM discoverer.
const evmDiscovery = createWalletSource(discoverEvmAdapters);

const WalletProvider = ({ children }: { children: ReactNode }) => (
  <WalletManagerProvider discovery={evmDiscovery} storageKeyPrefix="butr-demo">
    {children}
  </WalletManagerProvider>
);

export { WalletProvider, useDiscoveredWallets };
```

- [ ] **Step 2: `apps/demo-tanstack-start/src/wallet-provider.tsx`** — identical to Step 1 but **without** the `"use client"` first line.

- [ ] **Step 3: `apps/demo-with-viem/src/wallet-provider.tsx`** — identical to Step 2 (no `"use client"`). Verify the current file's storage prefix; keep whatever `storageKeyPrefix` it used (read the file first; default `"butr-demo"` if present).

- [ ] **Step 4: `apps/demo-with-wagmi/src/wallet-provider.tsx`** — identical to Step 3.

- [ ] **Step 5: Confirm consumers still import from the local provider module**

`apps/demo-next/src/app/page.tsx`, `apps/demo-tanstack-start/src/*`,
`apps/demo-with-viem/src/app.tsx`, `apps/demo-with-wagmi/src/app.tsx` import
`useDiscoveredWallets` from `"../wallet-provider"` / `"./wallet-provider"`.
Because Step 1 re-exports it, **no change needed** in those files. Grep to
confirm: `rg "useDiscoveredWallets" apps/demo-next apps/demo-tanstack-start apps/demo-with-viem apps/demo-with-wagmi`.

- [ ] **Step 6: Typecheck + lint these four apps**

Run: `pnpm turbo run typecheck lint --filter=demo-next --filter=demo-tanstack-start --filter=demo-with-viem --filter=demo-with-wagmi`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/demo-next/src/wallet-provider.tsx apps/demo-tanstack-start/src/wallet-provider.tsx apps/demo-with-viem/src/wallet-provider.tsx apps/demo-with-wagmi/src/wallet-provider.tsx
git commit -m "refactor(evm demos): drop DiscoverySubscriber boilerplate; use createWalletSource(discoverEvmAdapters)"
```

### Task D3: Solana demos (`demo-with-solana-web3js`, `demo-with-solana-wallet-adapter`, `demo-with-solana-kit`)

**Files:** each app's `src/wallet-provider.tsx`.

- [ ] **Step 1: For each of the three apps, set `src/wallet-provider.tsx` to**

```tsx
import type { ReactNode } from "react";
import { createWalletSource } from "@butr/core";
import { WalletManagerProvider, useDiscoveredWallets } from "@butr/react";
import { discoverSvmAdapters } from "@butr/svm";

// SVM-only: @butr/react + @butr/svm.
const svmDiscovery = createWalletSource(discoverSvmAdapters);

const WalletProvider = ({ children }: { children: ReactNode }) => (
  <WalletManagerProvider discovery={svmDiscovery} storageKeyPrefix="butr-demo">
    {children}
  </WalletManagerProvider>
);

export { WalletProvider, useDiscoveredWallets };
```

(First read each existing file; preserve its existing `storageKeyPrefix` value if it differs from `"butr-demo"`.)

- [ ] **Step 2: Confirm consumers import `useDiscoveredWallets` from the local provider module** (re-exported above — grep to verify, no edits expected).

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm turbo run typecheck lint --filter=demo-with-solana-web3js --filter=demo-with-solana-wallet-adapter --filter=demo-with-solana-kit`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/demo-with-solana-web3js/src/wallet-provider.tsx apps/demo-with-solana-wallet-adapter/src/wallet-provider.tsx apps/demo-with-solana-kit/src/wallet-provider.tsx
git commit -m "refactor(solana demos): use unified WalletManagerProvider + createWalletSource(discoverSvmAdapters)"
```

---

## Phase E — Documentation

Update every doc that shows the provider API. Code samples must match the
rewritten demos. Keep the existing "Source:" citations.

### Task E1: Concepts + getting-started + index

**Files:**
- `apps/docs/content/docs/index.mdx`
- `apps/docs/content/docs/getting-started/installation.mdx`
- `apps/docs/content/docs/getting-started/quickstart.mdx`
- `apps/docs/content/docs/concepts/connectors-and-wallets.mdx`
- `apps/docs/content/docs/concepts/hydration.mdx`

- [ ] **Step 1:** In each file, replace any `AutoWalletManagerProvider` usage with the unified pattern. Canonical batteries-included snippet to use everywhere:

```tsx
import { WalletManagerProvider } from "@butr/react";
import { autoDiscovery } from "@butr/wallets";

<WalletManagerProvider discovery={autoDiscovery()} storageKeyPrefix="app">
  {children}
</WalletManagerProvider>
```

- [ ] **Step 2:** In `concepts/hydration.mdx`, replace the "manual discovery setup you trigger `_tryRestoreFromPending` yourself" paragraph with: the provider now does this internally whenever you pass `discovery`; you only call `_tryRestoreFromPending` if you implement a fully custom `WalletSource`. In `concepts/connectors-and-wallets.mdx`, update the `createConnector` seam section to note discovery+createConnector compose (discovered id resolved first).

- [ ] **Step 3:** In `getting-started/installation.mdx`, keep package install tabs as-is; ensure prose says `@butr/wallets` provides `autoDiscovery` (not a provider). In `index.mdx` package table, change the `@butr/wallets` row description to "batteries-included EVM+SVM discovery source (`autoDiscovery`)".

- [ ] **Step 4:** `cd apps/docs && pnpm build` → expect success. Commit:

```bash
git add apps/docs/content/docs/index.mdx apps/docs/content/docs/getting-started apps/docs/content/docs/concepts
git commit -m "docs: unified provider in concepts/getting-started"
```

### Task E2: Guides + frameworks

**Files:**
- `apps/docs/content/docs/guides/provider-setup.mdx` (largest rewrite)
- `apps/docs/content/docs/guides/connect-disconnect.mdx`
- `apps/docs/content/docs/guides/multi-chain.mdx`
- `apps/docs/content/docs/frameworks/vite.mdx`
- `apps/docs/content/docs/frameworks/nextjs.mdx`
- `apps/docs/content/docs/frameworks/tanstack-start.mdx`
- `apps/docs/content/docs/frameworks/expo.mdx`

- [ ] **Step 1: Rewrite `guides/provider-setup.mdx`** around one component. New structure: "Auto" = `discovery={autoDiscovery()}`; "EVM-only" = `discovery={createWalletSource(discoverEvmAdapters)}` (no `@butr/wallets`); "Manual / custom" = `createConnector` only; "Composed" = `discovery` + `createConnector`. Use the exact demo snippets from Phase D.

- [ ] **Step 2:** `frameworks/vite.mdx` → demo-vite snippet (Task D1 Step 1). `frameworks/nextjs.mdx` → demo-next snippet (D2 Step 1, keep the `"use client"` + RSC explanation; remove the entire DiscoverySubscriber code block). `frameworks/tanstack-start.mdx` → D2 Step 2 snippet. `frameworks/expo.mdx` → demo-expo snippet (D1 Step 3).

- [ ] **Step 3:** `guides/connect-disconnect.mdx` + `guides/multi-chain.mdx`: fix any `import { useDiscoveredWallets } from "@butr/wallets"` → `@butr/react`; the parenthetical about "manual EVM-only setup, useDiscoveredWallets comes from your own provider module" is still true (re-exported) — keep but simplify.

- [ ] **Step 4:** `cd apps/docs && pnpm build` → success. Commit:

```bash
git add apps/docs/content/docs/guides apps/docs/content/docs/frameworks
git commit -m "docs: unified provider in guides + framework pages"
```

### Task E3: Connectors + integrations + API reference

**Files:**
- `apps/docs/content/docs/connectors/index.mdx`, `injected-evm.mdx`, `solana-wallet-standard.mdx`, `walletconnect.mdx`, `ledger.mdx`
- `apps/docs/content/docs/integrations/*.mdx` (provider snippets only)
- `apps/docs/content/docs/api/react.mdx`, `api/wallets.mdx`, `api/core.mdx`

- [ ] **Step 1: `api/react.mdx`** — replace the `WalletManagerProvider` props block with the flat-prop list (`discovery`, `connectors`, `createConnector`, the `on*`, `slowConnectThresholdMs`, `storage`, `storageKeyPrefix`). Add `useDiscoveredWallets()` to the sync-hooks table (returns `ReadonlyArray<WalletAdapter>`, empty without `discovery`). Remove the "`WalletManagerProvider` props: `{ config }`" wording.

- [ ] **Step 2: `api/wallets.mdx`** — remove the `AutoWalletManagerProvider` and `useDiscoveredWallets` sections; add `autoDiscovery(options?: DiscoverOptions): WalletSource` as the headline export; keep `createDiscoveryWalletSource`, discovery primitives, chains.

- [ ] **Step 3: `api/core.mdx`** — add `createWalletSource(subscribe)` under Functions; note `WalletSource` is the discovery seam.

- [ ] **Step 4: connectors** — the "register an explicit connector" examples become the composed unified form:

```ts
const wc = await createWalletConnectAdapter({ projectId, onPairingUri });
const extra = new Map([[wc.id, wc]]);

<WalletManagerProvider
  discovery={autoDiscovery()}
  connectors={[{ id: wc.id, name: wc.name, chainPlatform: "evm" }]}
  createConnector={(id) => extra.get(id) ?? null}
>
```

Update `connectors/index.mdx`, `walletconnect.mdx`, `ledger.mdx` accordingly; `injected-evm.mdx` / `solana-wallet-standard.mdx`: the `discoverEvmAdapters`/`discoverSvmAdapters` "wire it yourself" snippet becomes `createWalletSource(discoverEvmAdapters)` passed to `discovery`.

- [ ] **Step 5: integrations** — only the few provider-wiring lines; ensure none import `AutoWalletManagerProvider`. Most integration pages reference the demo provider indirectly — grep `rg -l "AutoWalletManagerProvider" apps/docs/content` must return nothing after this task.

- [ ] **Step 6:** `cd apps/docs && pnpm build` → success. Verify: `rg -n "AutoWalletManagerProvider" apps/docs/content` → no results. Commit:

```bash
git add apps/docs/content/docs/connectors apps/docs/content/docs/integrations apps/docs/content/docs/api
git commit -m "docs: unified provider in connectors, integrations, API reference"
```

---

## Phase F — Final verification

### Task F1: Repo-wide checks

- [ ] **Step 1:** `pnpm install` (lockfile unaffected, sanity) then `pnpm build` → all packages + apps build.
- [ ] **Step 2:** `pnpm test` → all package test tasks pass (core, react, wallets especially).
- [ ] **Step 3:** `pnpm turbo run typecheck lint --filter=@butr/core --filter=@butr/react --filter=@butr/wallets --filter='demo-*'` → pass. (`@butr/core#lint` and `@repo/wallet-extensions#typecheck` are known pre-existing failures unrelated to this change — confirm they are the only failures and unchanged.)
- [ ] **Step 4: EVM-only bundle guarantee.** Build demo-next: `pnpm --filter demo-next build`. Then `rg -l "@wallet-standard|@butr/svm|solana:signMessage" apps/demo-next/.next/static 2>/dev/null` → expect **no matches** (Solana code absent from an EVM-only app's client bundle).
- [ ] **Step 5: Docs.** `pnpm --filter docs build` → success. `rg -n "AutoWalletManagerProvider" apps/docs/content` → no matches. Start `pnpm --filter docs start`, curl `/docs/guides/provider-setup` and `/docs/frameworks/nextjs` → HTTP 200.
- [ ] **Step 6: Spot-check accuracy.** Diff a doc snippet against its demo: `apps/docs/content/docs/frameworks/vite.mdx` snippet must equal `apps/demo-vite/src/wallet-provider.tsx`.
- [ ] **Step 7: Final commit (if any verification fixups)**

```bash
git add -A
git commit -m "chore: verification fixups for unified provider"
```

---

## Self-Review

**Spec coverage:** core `createWalletSource` (A1) ✓; flat-prop provider + compose rule + `useDiscoveredWallets` move (B1) ✓; `autoDiscovery` + remove `AutoWalletManagerProvider` (C1) ✓; all 9 demos (D1–D3) ✓; all affected docs incl. `api/core` `createWalletSource` (E1–E3) ✓; EVM-only bundle verification (F1 Step 4) ✓; tests via `@butr/testing` fakes + `WalletSource` fake (B1) ✓.

**Placeholder scan:** no TBD/TODO; every code step shows full file or exact find/replace. D2 Step 3/D3 Step 1 say "read first, preserve existing `storageKeyPrefix`" — concrete instruction, not a placeholder.

**Type consistency:** `WalletSource`, `createWalletSource`, `autoDiscovery`, `WalletManagerProviderProps` (flat), `useDiscoveredWallets`, `createConnector` resolution `adapters.get(id) ?? userCreate?.(id) ?? null` consistent across A1/B1/C1 and all demo/doc snippets. Test helper `configToProps` keys match the provider's flat props exactly.
