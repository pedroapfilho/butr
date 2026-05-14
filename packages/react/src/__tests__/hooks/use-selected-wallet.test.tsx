import { describe, expect, it } from "vitest";
import { useSelectedWallet } from "../../hooks";
import { renderHookWithProvider } from "../render-with-provider";

describe("useSelectedWallet", () => {
  it("returns undefined when the platform has no selection", () => {
    const { result } = renderHookWithProvider(() => useSelectedWallet("evm"));
    expect(result.current).toBeUndefined();
  });

  it("returns undefined when chainPlatform is null", () => {
    const { result } = renderHookWithProvider(() => useSelectedWallet(null));
    expect(result.current).toBeUndefined();
  });
});
