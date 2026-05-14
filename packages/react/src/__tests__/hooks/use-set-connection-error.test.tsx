import { describe, expect, it } from "vitest";
import { useSetConnectionError } from "../../hooks";
import { renderHookWithProvider } from "../render-with-provider";

describe("useSetConnectionError", () => {
  it("returns the store's setConnectionError action", () => {
    const { result } = renderHookWithProvider(() => useSetConnectionError());
    expect(typeof result.current).toBe("function");
  });
});
