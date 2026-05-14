import { describe, expect, it } from "vitest";
import { useConnectedWallets } from "../../hooks";
import { renderHookWithProvider } from "../render-with-provider";

describe("useConnectedWallets", () => {
  it("returns an empty array when pool is empty", () => {
    const { result } = renderHookWithProvider(() => useConnectedWallets());
    expect(result.current).toEqual([]);
  });
});
