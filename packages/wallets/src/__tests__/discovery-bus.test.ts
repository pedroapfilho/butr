import { describe, expect, it, vi } from "vitest";
import { createDiscoveryBus } from "../discovery-bus";
import type { DiscoveryPath } from "../discovery-bus";
import { createMockConnector } from "./helpers";

const pathThatEmits = (
  ...adapterIds: ReadonlyArray<string>
): { path: DiscoveryPath; unsubscribe: ReturnType<typeof vi.fn> } => {
  const unsubscribe = vi.fn();
  return {
    path: (emit) => {
      for (const id of adapterIds) {
        emit(createMockConnector({ id }));
      }
      return unsubscribe;
    },
    unsubscribe,
  };
};

describe("createDiscoveryBus", () => {
  it("forwards a single adapter from one path", () => {
    const onAdapter = vi.fn();
    const bus = createDiscoveryBus(onAdapter);
    bus.register(pathThatEmits("wallet-a").path);

    expect(onAdapter).toHaveBeenCalledTimes(1);
    expect(onAdapter.mock.calls[0]?.[0].id).toBe("wallet-a");
  });

  it("dedupes adapters by id across the same path", () => {
    const onAdapter = vi.fn();
    const bus = createDiscoveryBus(onAdapter);
    bus.register(pathThatEmits("wallet-a", "wallet-a", "wallet-b").path);

    expect(onAdapter).toHaveBeenCalledTimes(2);
    expect(onAdapter.mock.calls.map((c) => c[0].id)).toEqual(["wallet-a", "wallet-b"]);
  });

  it("dedupes adapters by id across multiple paths", () => {
    const onAdapter = vi.fn();
    const bus = createDiscoveryBus(onAdapter);
    bus.register(pathThatEmits("wallet-a", "wallet-b").path);
    bus.register(pathThatEmits("wallet-b", "wallet-c").path);

    expect(onAdapter.mock.calls.map((c) => c[0].id)).toEqual([
      "wallet-a",
      "wallet-b",
      "wallet-c",
    ]);
  });

  it("hasAny returns false before any emit", () => {
    const bus = createDiscoveryBus(vi.fn());
    expect(bus.hasAny()).toBe(false);
  });

  it("hasAny returns true after the first emit", () => {
    const bus = createDiscoveryBus(vi.fn());
    bus.register(pathThatEmits("wallet-a").path);
    expect(bus.hasAny()).toBe(true);
  });

  it("register(null) is a no-op", () => {
    const onAdapter = vi.fn();
    const bus = createDiscoveryBus(onAdapter);
    expect(() => bus.register(null)).not.toThrow();
    expect(onAdapter).not.toHaveBeenCalled();
    expect(bus.hasAny()).toBe(false);
  });

  it("supports the injected-fallback pattern: skip emit when an earlier path has emitted", () => {
    const onAdapter = vi.fn();
    const bus = createDiscoveryBus(onAdapter);
    bus.register(pathThatEmits("eip6963-wallet").path);

    // The injected path consults bus.hasAny() at emit time.
    const injectedEmits = vi.fn();
    bus.register((emit) => {
      if (!bus.hasAny()) {
        emit(createMockConnector({ id: "injected-wallet" }));
        injectedEmits();
      }
      return () => {};
    });

    expect(injectedEmits).not.toHaveBeenCalled();
    expect(onAdapter.mock.calls.map((c) => c[0].id)).toEqual(["eip6963-wallet"]);
  });

  it("injected fallback DOES emit when no prior path emitted", () => {
    const onAdapter = vi.fn();
    const bus = createDiscoveryBus(onAdapter);
    bus.register((emit) => {
      if (!bus.hasAny()) {
        emit(createMockConnector({ id: "injected-wallet" }));
      }
      return () => {};
    });
    expect(onAdapter.mock.calls.map((c) => c[0].id)).toEqual(["injected-wallet"]);
  });

  it("unsubscribeAll tears down every registered path", () => {
    const a = pathThatEmits();
    const b = pathThatEmits();
    const bus = createDiscoveryBus(vi.fn());
    bus.register(a.path);
    bus.register(b.path);

    bus.unsubscribeAll();

    expect(a.unsubscribe).toHaveBeenCalledTimes(1);
    expect(b.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("unsubscribeAll drops references so a second call is a no-op", () => {
    const a = pathThatEmits();
    const bus = createDiscoveryBus(vi.fn());
    bus.register(a.path);

    bus.unsubscribeAll();
    bus.unsubscribeAll();

    expect(a.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("survives an unsubscribe that throws — neighbours still tear down", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = {
      path: (() => () => {
        throw new Error("unsub blew up");
      }) as DiscoveryPath,
    };
    const b = pathThatEmits();
    const bus = createDiscoveryBus(vi.fn());
    bus.register(a.path);
    bus.register(b.path);

    expect(() => bus.unsubscribeAll()).not.toThrow();
    expect(b.unsubscribe).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "[butr] discovery unsubscribe threw:",
      expect.any(Error),
    );
    warn.mockRestore();
  });
});
