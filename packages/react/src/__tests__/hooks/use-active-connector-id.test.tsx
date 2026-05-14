import { describe, expect, it } from "vitest";
import { useActiveConnectorId } from "../../hooks";
import { renderHookWithProvider } from "../render-with-provider";

describe("useActiveConnectorId", () => {
  it("returns null on a fresh provider", () => {
    const { result } = renderHookWithProvider(() => useActiveConnectorId());
    expect(result.current).toBeNull();
  });
});
