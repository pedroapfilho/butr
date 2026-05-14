import { describe, expect, it } from "vitest";
import { useConnectingConnectorId } from "../../hooks";
import { renderHookWithProvider } from "../render-with-provider";

describe("useConnectingConnectorId", () => {
  it("returns null on a fresh provider", () => {
    const { result } = renderHookWithProvider(() => useConnectingConnectorId());
    expect(result.current).toBeNull();
  });
});
