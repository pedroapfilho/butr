import { act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createFakeAdapter } from "@butr/testing";
import { useSigner } from "../../hooks-async";
import { useConnectWallet } from "../../hooks";
import { renderHookWithProvider } from "../render-with-provider";

describe("useSigner", () => {
  it("is idle when no wallet is connected", () => {
    const { result } = renderHookWithProvider(() => useSigner());
    expect(result.current.status).toBe("idle");
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("transitions idle → loading → success once the wallet is connected", async () => {
    const account = {
      chain: { id: "eip155:1", name: "Ethereum", namespace: "eip155" as const, reference: "1" },
      id: "eip155:1:0xa",
      walletAddress: "0xa",
    };
    const signer = { kind: "fake-signer" };
    const adapter = createFakeAdapter({
      id: "fake",
      chainPlatform: "evm",
      accounts: [account],
    });
    adapter.getSigner = () => Promise.resolve(signer);
    const { result } = renderHookWithProvider(
      () => ({ connect: useConnectWallet(), signer: useSigner() }),
      { adapters: [adapter] },
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await result.current.connect(adapter.id);
    });
    await waitFor(() => {
      expect(result.current.signer.status).toBe("success");
    });
    expect(result.current.signer.data).toBe(signer);
  });

  it("transitions to error when getSigner rejects", async () => {
    const account = {
      chain: { id: "eip155:1", name: "Ethereum", namespace: "eip155" as const, reference: "1" },
      id: "eip155:1:0xb",
      walletAddress: "0xb",
    };
    const boom = new Error("getSigner blew up");
    const adapter = createFakeAdapter({
      id: "fake",
      chainPlatform: "evm",
      accounts: [account],
    });
    adapter.getSigner = () => Promise.reject(boom);
    const { result } = renderHookWithProvider(
      () => ({ connect: useConnectWallet(), signer: useSigner() }),
      { adapters: [adapter] },
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await result.current.connect(adapter.id);
    });
    await waitFor(() => {
      expect(result.current.signer.status).toBe("error");
    });
    expect(result.current.signer.error).toBe(boom);
  });
});

void vi;
