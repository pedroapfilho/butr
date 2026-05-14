import { describe, expect, it } from "vitest";
import { useRequestAccounts } from "../../hooks";
import { renderHookWithProvider } from "../render-with-provider";

describe("useRequestAccounts", () => {
  it("returns the store's requestAccounts action", () => {
    const { result } = renderHookWithProvider(() => useRequestAccounts());
    expect(typeof result.current).toBe("function");
  });
});
