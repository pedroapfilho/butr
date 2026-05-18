import { describe, expect, it } from "vitest";
import { autoDiscovery } from "../auto-discovery";

describe("autoDiscovery", () => {
  it("returns a WalletSource whose subscribe returns an unsubscribe fn", () => {
    const source = autoDiscovery({ evm: false, injected: false, svm: false });
    expect(typeof source.subscribe).toBe("function");
    const unsubscribe = source.subscribe(() => {});
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });
});
