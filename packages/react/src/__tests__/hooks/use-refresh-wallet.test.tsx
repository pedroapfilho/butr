import { describe, expect, it } from "vitest";
import { useRefreshWallet } from "../../hooks";
import { renderHookWithProvider } from "../render-with-provider";

describe("useRefreshWallet", () => {
  it("returns the store's refreshWallet action", () => {
    const { result } = renderHookWithProvider(() => useRefreshWallet());
    expect(typeof result.current).toBe("function");
  });
});
