import { describe, expect, it, vi } from "vitest";
import { ANNOUNCE_EVENT, REQUEST_EVENT, discoverEvmAdapters } from "../eip6963";
import type { Eip1193Provider, Eip6963ProviderDetail } from "../eip1193";

const noopProvider: Eip1193Provider = {
  on() {},
  removeListener() {},
  request() {
    return Promise.resolve();
  },
};

const announce = (target: EventTarget, detail: Eip6963ProviderDetail) => {
  target.dispatchEvent(new CustomEvent(ANNOUNCE_EVENT, { detail }));
};

describe("discoverEvmAdapters", () => {
  it("dispatches a requestProvider event on subscribe", () => {
    const target = new EventTarget();
    let sawRequest = false;
    target.addEventListener(REQUEST_EVENT, () => {
      sawRequest = true;
    });

    const unsub = discoverEvmAdapters(() => {}, { target });
    expect(sawRequest).toBe(true);

    unsub();
  });

  it("invokes the callback for each unique rdns", () => {
    const target = new EventTarget();
    const callback = vi.fn();
    const unsub = discoverEvmAdapters(callback, { target });

    announce(target, {
      info: {
        icon: "data:image/svg+xml;base64,A",
        name: "MetaMask",
        rdns: "io.metamask",
        uuid: "uuid-1",
      },
      provider: noopProvider,
    });
    announce(target, {
      info: {
        icon: "data:image/svg+xml;base64,B",
        name: "Rabby",
        rdns: "io.rabby",
        uuid: "uuid-2",
      },
      provider: noopProvider,
    });

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback.mock.calls[0]?.[0].id).toBe("io.metamask");
    expect(callback.mock.calls[1]?.[0].id).toBe("io.rabby");

    unsub();
  });

  it("deduplicates re-announces by rdns", () => {
    const target = new EventTarget();
    const callback = vi.fn();
    const unsub = discoverEvmAdapters(callback, { target });

    const detail: Eip6963ProviderDetail = {
      info: {
        icon: "data:image/svg+xml;base64,A",
        name: "MetaMask",
        rdns: "io.metamask",
        uuid: "uuid-1",
      },
      provider: noopProvider,
    };
    announce(target, detail);
    announce(target, { ...detail, info: { ...detail.info, uuid: "uuid-changed" } });

    expect(callback).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("ignores announcements with missing or empty rdns", () => {
    const target = new EventTarget();
    const callback = vi.fn();
    const unsub = discoverEvmAdapters(callback, { target });

    announce(target, {
      info: {
        icon: "data:image/svg+xml;base64,A",
        name: "Broken Wallet",
        rdns: "",
        uuid: "uuid-1",
      },
      provider: noopProvider,
    });

    expect(callback).not.toHaveBeenCalled();
    unsub();
  });

  it("ignores wallets announced after unsubscribe", () => {
    const target = new EventTarget();
    const callback = vi.fn();
    const unsub = discoverEvmAdapters(callback, { target });
    unsub();

    announce(target, {
      info: {
        icon: "data:image/svg+xml;base64,A",
        name: "Late Wallet",
        rdns: "io.late",
        uuid: "uuid-1",
      },
      provider: noopProvider,
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it("returns a noop in environments without a window", () => {
    const callback = vi.fn();
    // No `target` passed; `globalThis.window` is undefined in this
    // node test environment, so discovery short-circuits.
    const unsub = discoverEvmAdapters(callback);
    unsub();
    expect(callback).not.toHaveBeenCalled();
  });
});
