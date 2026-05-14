import { describe, expect, it } from "vitest";
import { useResetConnectionStatus } from "../../hooks";
import { renderHookWithProvider } from "../render-with-provider";

describe("useResetConnectionStatus", () => {
  it("returns the store's resetConnectionStatus action", () => {
    const { result } = renderHookWithProvider(() => useResetConnectionStatus());
    expect(typeof result.current).toBe("function");
  });
});
