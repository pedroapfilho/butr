import { describe, expect, it } from "vitest";
import { useWalletStore } from "../../hooks";
import { renderHookWithProvider } from "../render-with-provider";

describe("useWalletStore", () => {
  it("runs a selector against the store and returns the result", () => {
    const { result } = renderHookWithProvider(() =>
      useWalletStore((state) => state.connectionStatus),
    );
    expect(result.current).toBe("idle");
  });

  it("supports shape-returning selectors via shallow equality", () => {
    const { result } = renderHookWithProvider(() =>
      useWalletStore((state) => ({
        connectionStatus: state.connectionStatus,
        poolSize: state.pool.size,
      })),
    );
    expect(result.current).toEqual({ connectionStatus: "idle", poolSize: 0 });
  });
});
