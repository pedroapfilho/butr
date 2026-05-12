import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Eip1193Provider } from "../eip1193";
import { discoverInjectedAdapter } from "../injected";

const fakeProvider: Eip1193Provider = {
  on() {},
  removeListener() {},
  request() {
    return Promise.resolve();
  },
};

describe("discoverInjectedAdapter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits a generic adapter after the settle window when window.ethereum exists", () => {
    const callback = vi.fn();
    const unsub = discoverInjectedAdapter(callback, {
      settleMs: 50,
      target: { ethereum: fakeProvider },
    });

    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(callback).toHaveBeenCalledTimes(1);

    const [adapter] = callback.mock.calls[0] ?? [];
    expect(adapter?.id).toBe("injected:legacy");
    expect(adapter?.name).toBe("Browser wallet");
    expect(adapter?.chainPlatform).toBe("evm");

    unsub();
  });

  it("skips emission when hasAnyEip6963Adapter() is true at settle time", () => {
    const callback = vi.fn();
    let seenEip6963 = false;
    const unsub = discoverInjectedAdapter(callback, {
      hasAnyEip6963Adapter: () => seenEip6963,
      settleMs: 50,
      target: { ethereum: fakeProvider },
    });

    // EIP-6963 fired before the settle timer
    seenEip6963 = true;
    vi.advanceTimersByTime(50);

    expect(callback).not.toHaveBeenCalled();
    unsub();
  });

  it("skips emission when window.ethereum is undefined", () => {
    const callback = vi.fn();
    const unsub = discoverInjectedAdapter(callback, {
      settleMs: 50,
      target: {},
    });

    vi.advanceTimersByTime(50);
    expect(callback).not.toHaveBeenCalled();
    unsub();
  });

  it("skips emission when ethereum lacks a request method (sanity check)", () => {
    const callback = vi.fn();
    const unsub = discoverInjectedAdapter(callback, {
      settleMs: 50,
      target: { ethereum: { on() {}, removeListener() {} } },
    });

    vi.advanceTimersByTime(50);
    expect(callback).not.toHaveBeenCalled();
    unsub();
  });

  it("cancels the pending emit when unsubscribed before the settle window elapses", () => {
    const callback = vi.fn();
    const unsub = discoverInjectedAdapter(callback, {
      settleMs: 50,
      target: { ethereum: fakeProvider },
    });

    unsub();
    vi.advanceTimersByTime(100);

    expect(callback).not.toHaveBeenCalled();
  });
});
