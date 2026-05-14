import { describe, expect, it } from "vitest";
import { useSetActiveConnector } from "../../hooks";
import { renderHookWithProvider } from "../render-with-provider";

describe("useSetActiveConnector", () => {
  it("returns the store's setActiveConnector action", () => {
    const { result } = renderHookWithProvider(() => useSetActiveConnector());
    expect(typeof result.current).toBe("function");
  });
});
