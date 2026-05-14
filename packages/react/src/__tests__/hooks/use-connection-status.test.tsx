import { describe, expect, it } from "vitest";
import { useConnectionStatus } from "../../hooks";
import { renderHookWithProvider } from "../render-with-provider";

describe("useConnectionStatus", () => {
  it("returns 'idle' on a fresh provider", () => {
    const { result } = renderHookWithProvider(() => useConnectionStatus());
    expect(result.current).toBe("idle");
  });
});
