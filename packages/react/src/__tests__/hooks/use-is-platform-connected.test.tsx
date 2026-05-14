import { describe, expect, it } from "vitest";
import { useIsPlatformConnected } from "../../hooks";
import { renderHookWithProvider } from "../render-with-provider";

describe("useIsPlatformConnected", () => {
  it("is false when no platform is selected", () => {
    const { result } = renderHookWithProvider(() => useIsPlatformConnected("evm"));
    expect(result.current).toBe(false);
  });
});
