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
import { useConnectWallet, useConnectedWallets, useWalletStore } from "../hooks";

const sourceOf = (...adapters: Array<WalletAdapter>): WalletSource => ({
  subscribe: (onAdapter) => {
    for (const a of adapters) {
      onAdapter(a);
    }
    return () => {};
  },
});

// eslint-disable-next-line react/display-name -- test wrapper factory, display name not needed
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
    const discovered = createFakeAdapter({
      accounts: [{ chain: { id: "eip155:1", name: "Ethereum", namespace: "eip155", reference: "1" }, id: "eip155:1:0x1", walletAddress: "0x1" }],
      id: "dup",
    });
    const fallback = vi.fn(() => null);
    const { result } = renderHook(
      () => ({ connect: useConnectWallet(), connected: useConnectedWallets() }),
      { wrapper: wrap({ createConnector: fallback, discovery: sourceOf(discovered) }) },
    );
    await act(async () => {
      await Promise.resolve();
      await result.current.connect("dup");
    });
    expect(fallback).not.toHaveBeenCalledWith("dup");
    expect(result.current.connected.map((w) => w.connector.id)).toContain("dup");
  });

  it("uses createConnector when discovery has no match", async () => {
    const manual = createFakeAdapter({
      accounts: [{ chain: { id: "eip155:1", name: "Ethereum", namespace: "eip155", reference: "1" }, id: "eip155:1:0x1", walletAddress: "0x1" }],
      id: "manual",
    });
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

  it("restores a pending wallet when its adapter announces after mount (deferred)", async () => {
    const deferredAccount = {
      chain: { id: "eip155:1", name: "Ethereum", namespace: "eip155" as const, reference: "1" },
      id: "eip155:1:0xdeferred",
      walletAddress: "0xdeferred",
    };
    const seededPersistence = createFakePersistence({
      activeConnectorId: "deferred",
      pool: {
        deferred: {
          account: deferredAccount,
          accounts: [deferredAccount],
          chainPlatform: "evm",
          connectorId: "deferred",
        },
      },
    });

    let emitAdapter: ((adapter: ReturnType<typeof createFakeAdapter>) => void) | null = null;
    const deferredSource: WalletSource = {
      subscribe: (onAdapter) => {
        emitAdapter = onAdapter;
        queueMicrotask(() => {
          emitAdapter?.(createFakeAdapter({ accounts: [deferredAccount], id: "deferred" }));
        });
        return () => {
          emitAdapter = null;
        };
      },
    };

    const { result } = renderHook(
      () => useWalletStore((s) => ({ isHydrated: s.isHydrated, pool: s.pool })),
      {
        wrapper: wrap({ discovery: deferredSource, storage: seededPersistence }),
      },
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isHydrated).toBe(true);
    expect(result.current.pool.has("deferred")).toBe(true);
  });
});

describe("useDiscoveredWallets outside provider", () => {
  it("returns empty array", () => {
    const { result } = renderHook(() => useDiscoveredWallets());
    expect(result.current).toEqual([]);
  });
});
