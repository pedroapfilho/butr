import { describe, expect, it } from "vitest";
import { useGetWallet } from "../../hooks";
import { renderHookWithProvider } from "../render-with-provider";

describe("useGetWallet", () => {
  it("returns a function that looks up wallets by id", () => {
    const { result } = renderHookWithProvider(() => useGetWallet());
    expect(typeof result.current).toBe("function");
    expect(result.current("does-not-exist")).toBeUndefined();
  });
});
