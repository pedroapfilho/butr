import { describe, expect, it } from "vitest";
import { useUpdateWalletAccount } from "../../hooks";
import { renderHookWithProvider } from "../render-with-provider";

describe("useUpdateWalletAccount", () => {
  it("returns the store's updateWalletAccount action", () => {
    const { result } = renderHookWithProvider(() => useUpdateWalletAccount());
    expect(typeof result.current).toBe("function");
  });
});
