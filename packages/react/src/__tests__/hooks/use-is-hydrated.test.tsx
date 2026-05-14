import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useIsHydrated } from "../../hooks";
import { renderHookWithProvider } from "../render-with-provider";

describe("useIsHydrated", () => {
  it("flips to true after the mount-time hydration completes", async () => {
    const { result } = renderHookWithProvider(() => useIsHydrated());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current).toBe(true);
  });
});
