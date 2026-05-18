import { describe, expect, it, vi } from "vitest";
import type { DiscoverOptions } from "../discover";

type DiscoverMod = {
  discoverWalletAdapters: (
    onAdapter: (adapter: unknown) => void,
    options?: DiscoverOptions,
  ) => () => void;
  resolveDiscoverOptions: (auto: true | false | DiscoverOptions | undefined) => {
    active: boolean;
    evm: boolean;
    injected: boolean;
    svm: boolean;
  };
};

vi.mock("../discover", async (importOriginal) => {
  const original = await importOriginal<DiscoverMod>();
  return {
    ...original,
    discoverWalletAdapters: vi.fn(() => () => {}),
  };
});

import { discoverWalletAdapters } from "../discover";
import { autoDiscovery } from "../auto-discovery";

describe("autoDiscovery", () => {
  it("returns a WalletSource whose subscribe returns an unsubscribe fn", () => {
    const source = autoDiscovery({ evm: false, injected: false, svm: false });
    expect(typeof source.subscribe).toBe("function");
    const unsubscribe = source.subscribe(() => {});
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });

  it("subscribe with evm:false svm:false returns a no-op unsubscribe fn", () => {
    const source = autoDiscovery({ evm: false, svm: false });
    const unsubscribe = source.subscribe(() => {});
    expect(typeof unsubscribe).toBe("function");
    expect(() => unsubscribe()).not.toThrow();
  });

  it("forwards options to discoverWalletAdapters — evm:true svm:false activates EVM discovery only", () => {
    vi.mocked(discoverWalletAdapters).mockClear();

    const onAdapter = vi.fn();
    const source = autoDiscovery({ evm: true, svm: false });
    const unsubscribe = source.subscribe(onAdapter);

    expect(discoverWalletAdapters).toHaveBeenCalledOnce();
    expect(discoverWalletAdapters).toHaveBeenCalledWith(onAdapter, { evm: true, svm: false });

    unsubscribe();
  });
});
