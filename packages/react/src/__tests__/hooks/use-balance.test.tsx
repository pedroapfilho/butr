import { act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createFakeAdapter } from "@butr/testing";
import { useBalance } from "../../hooks-async";
import { useConnectWallet } from "../../hooks";
import { renderHookWithProvider } from "../render-with-provider";

describe("useBalance", () => {
  const buildAdapter = () => {
    const account = {
      chain: { id: "eip155:1", name: "Ethereum", namespace: "eip155" as const, reference: "1" },
      id: "eip155:1:0xc",
      walletAddress: "0xc",
    };
    const adapter = createFakeAdapter({ id: "fake", chainPlatform: "evm", accounts: [account] });
    return { account, adapter };
  };

  it("is idle when nothing is connected", () => {
    const { result } = renderHookWithProvider(() => useBalance());
    expect(result.current.status).toBe("idle");
    expect(typeof result.current.refetch).toBe("function");
  });

  it("transitions to success after a wallet connects", async () => {
    const { adapter } = buildAdapter();
    const balance = { decimals: 18, formatted: "1.5", symbol: "ETH", value: 1500000000000000000n };
    adapter.getBalance = () => Promise.resolve(balance);
    const { result } = renderHookWithProvider(
      () => ({ balance: useBalance(), connect: useConnectWallet() }),
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
      expect(result.current.balance.status).toBe("success");
    });
    expect(result.current.balance.data).toEqual(balance);
  });

  it("re-fetches when refetch() is called", async () => {
    const { adapter } = buildAdapter();
    const getBalance = vi.fn().mockResolvedValue({
      decimals: 18,
      formatted: "1",
      symbol: "ETH",
      value: 1n,
    });
    adapter.getBalance = getBalance;
    const { result } = renderHookWithProvider(
      () => ({ balance: useBalance(), connect: useConnectWallet() }),
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
      expect(result.current.balance.status).toBe("success");
    });
    const callsAfterConnect = getBalance.mock.calls.length;
    act(() => {
      result.current.balance.refetch();
    });
    await waitFor(() => {
      expect(getBalance.mock.calls.length).toBeGreaterThan(callsAfterConnect);
    });
  });

  it("reports the error from a rejecting getBalance", async () => {
    const { adapter } = buildAdapter();
    const boom = new Error("balance failed");
    adapter.getBalance = () => Promise.reject(boom);
    const { result } = renderHookWithProvider(
      () => ({ balance: useBalance(), connect: useConnectWallet() }),
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
      expect(result.current.balance.status).toBe("error");
    });
    expect(result.current.balance.error).toBe(boom);
  });
});
