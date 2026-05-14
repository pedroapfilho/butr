import { describe, expect, it } from "vitest";
import { useAccounts } from "../../hooks";
import { renderHookWithProvider } from "../render-with-provider";

describe("useAccounts", () => {
  it("returns an empty array when no wallet is connected", () => {
    const { result } = renderHookWithProvider(() => useAccounts());
    expect(result.current).toEqual([]);
  });

  it("returns an empty array for a connector that isn't in the pool", () => {
    const { result } = renderHookWithProvider(() => useAccounts("io.metamask"));
    expect(result.current).toEqual([]);
  });
});
