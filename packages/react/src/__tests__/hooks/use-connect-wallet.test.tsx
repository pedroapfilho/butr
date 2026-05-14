import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createFakeAdapter } from "@butr/testing";
import { useConnectWallet, usePool } from "../../hooks";
import { renderHookWithProvider } from "../render-with-provider";

describe("useConnectWallet", () => {
  it("returns the store's connectWallet action", () => {
    const { result } = renderHookWithProvider(() => useConnectWallet());
    expect(typeof result.current).toBe("function");
  });

  it("connects a wallet and adds it to the pool", async () => {
    const account = {
      chain: { id: "eip155:1", name: "Ethereum", namespace: "eip155" as const, reference: "1" },
      id: "eip155:1:0x1",
      walletAddress: "0x1",
    };
    const adapter = createFakeAdapter({
      id: "fake",
      chainPlatform: "evm",
      accounts: [account],
    });
    const { result } = renderHookWithProvider(
      () => ({ connect: useConnectWallet(), pool: usePool() }),
      { adapters: [adapter] },
    );
    // Wait for hydration to settle.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await result.current.connect(adapter.id);
    });
    expect(result.current.pool.has(adapter.id)).toBe(true);
  });
});
