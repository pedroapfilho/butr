import { describe, expect, it } from "vitest";
import { useConnectionError } from "../../hooks";
import { renderHookWithProvider } from "../render-with-provider";

describe("useConnectionError", () => {
  it("returns null on a fresh provider", () => {
    const { result } = renderHookWithProvider(() => useConnectionError());
    expect(result.current).toBeNull();
  });
});
