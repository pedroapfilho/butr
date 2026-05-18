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
