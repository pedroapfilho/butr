import { describe, expect, it } from "vitest";
import { usePool } from "../../hooks";
import { renderHookWithProvider } from "../render-with-provider";

describe("usePool", () => {
  it("returns the pool Map (empty on fresh provider)", () => {
    const { result } = renderHookWithProvider(() => usePool());
    expect(result.current).toBeInstanceOf(Map);
    expect(result.current.size).toBe(0);
  });
});
