import { describe, expect, it } from "vitest";
import { useGetConnectorInstance } from "../../hooks";
import { renderHookWithProvider } from "../render-with-provider";

describe("useGetConnectorInstance", () => {
  it("returns the store's getConnectorInstance accessor", () => {
    const { result } = renderHookWithProvider(() => useGetConnectorInstance());
    expect(typeof result.current).toBe("function");
    expect(result.current("does-not-exist")).toBeNull();
  });
});
