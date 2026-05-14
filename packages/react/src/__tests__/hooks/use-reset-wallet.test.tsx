import { describe, expect, it } from "vitest";
import { useResetWallet } from "../../hooks";
import { renderHookWithProvider } from "../render-with-provider";

describe("useResetWallet", () => {
  it("returns the store's reset action", () => {
    const { result } = renderHookWithProvider(() => useResetWallet());
    expect(typeof result.current).toBe("function");
  });
});
