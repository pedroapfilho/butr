import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createFakeAdapter } from "@butr/testing";
import { useConnectWallet, useWalletEntry } from "../../hooks-async";
import { renderHookWithProvider } from "../render-with-provider";
import { useConnectWallet as useConnectWalletSync } from "../../hooks";

describe("useWalletEntry", () => {
  it("returns undefined when nothing is connected and no id is provided", () => {
    const { result } = renderHookWithProvider(() => useWalletEntry(undefined));
    expect(result.current).toBeUndefined();
  });

  it("returns undefined when the connector id isn't in the pool", () => {
    const { result } = renderHookWithProvider(() => useWalletEntry("nope"));
    expect(result.current).toBeUndefined();
  });

  it("resolves to the active wallet's entry when id is omitted", async () => {
    const account = {
      chain: { id: "eip155:1", name: "Ethereum", namespace: "eip155" as const, reference: "1" },
      id: "eip155:1:0xaa",
      walletAddress: "0xaa",
    };
    const adapter = createFakeAdapter({ id: "fake", chainPlatform: "evm", accounts: [account] });
    const { result } = renderHookWithProvider(
      () => ({ connect: useConnectWalletSync(), entry: useWalletEntry(undefined) }),
      { adapters: [adapter] },
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await result.current.connect(adapter.id);
    });
    expect(result.current.entry?.connector.id).toBe(adapter.id);
  });
});

// Suppress unused-import warning while keeping the imports above honest.
void useConnectWallet;
