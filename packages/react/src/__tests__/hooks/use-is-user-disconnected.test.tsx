import { describe, expect, it } from "vitest";
import { useIsUserDisconnected } from "../../hooks";
import { renderHookWithProvider } from "../render-with-provider";

describe("useIsUserDisconnected", () => {
  it("is false on a fresh provider", () => {
    const { result } = renderHookWithProvider(() => useIsUserDisconnected());
    expect(result.current).toBe(false);
  });
});
