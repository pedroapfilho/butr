import { describe, expect, it } from "vitest";
import { useSetSelection } from "../../hooks";
import { renderHookWithProvider } from "../render-with-provider";

describe("useSetSelection", () => {
  it("returns the store's setSelection action", () => {
    const { result } = renderHookWithProvider(() => useSetSelection());
    expect(typeof result.current).toBe("function");
  });
});
