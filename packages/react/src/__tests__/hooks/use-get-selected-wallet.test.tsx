import { describe, expect, it } from "vitest";
import { useGetSelectedWallet } from "../../hooks";
import { renderHookWithProvider } from "../render-with-provider";

describe("useGetSelectedWallet", () => {
  it("returns a function that looks up wallets by platform", () => {
    const { result } = renderHookWithProvider(() => useGetSelectedWallet());
    expect(typeof result.current).toBe("function");
    expect(result.current("evm")).toBeUndefined();
    expect(result.current("svm")).toBeUndefined();
  });
});
