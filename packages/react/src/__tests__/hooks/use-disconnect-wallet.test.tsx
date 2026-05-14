import { describe, expect, it } from "vitest";
import { useDisconnectWallet } from "../../hooks";
import { renderHookWithProvider } from "../render-with-provider";

describe("useDisconnectWallet", () => {
  it("returns the store's disconnectWallet action", () => {
    const { result } = renderHookWithProvider(() => useDisconnectWallet());
    expect(typeof result.current).toBe("function");
  });
});
