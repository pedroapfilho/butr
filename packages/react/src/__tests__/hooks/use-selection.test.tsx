import { describe, expect, it } from "vitest";
import { useSelection } from "../../hooks";
import { renderHookWithProvider } from "../render-with-provider";

describe("useSelection", () => {
  it("returns the selection Map (empty on fresh provider)", () => {
    const { result } = renderHookWithProvider(() => useSelection());
    expect(result.current).toBeInstanceOf(Map);
    expect(result.current.size).toBe(0);
  });
});
