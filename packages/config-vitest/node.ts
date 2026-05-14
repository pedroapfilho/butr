import { defineConfig } from "vitest/config";

const nodeConfig = defineConfig({
  test: {
    coverage: {
      all: true,
      exclude: [
        "**/__tests__/**",
        "**/*.test.{ts,tsx}",
        "**/*.config.{ts,js,mjs,cjs}",
        "**/*.d.ts",
        "**/dist/**",
        "**/node_modules/**",
      ],
      include: ["src/**/*.{ts,tsx}"],
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      // Per-package threshold. Each package can ratchet up by overriding
      // in its own vitest.config.ts (`mergeConfig` + a stricter floor).
      // The realistic floor today: protocol adapters (@butr/evm, @butr/
      // ledger, @butr/walletconnect) have EIP-1193 error-handling branches
      // and protocol-specific wallet quirks that need expensive mocks
      // to reach; the floor is set so they pass without forcing low-value
      // coverage tests.
      thresholds: {
        branches: 60,
        functions: 70,
        lines: 78,
        statements: 78,
      },
    },
    environment: "node",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    passWithNoTests: true,
  },
});

export default nodeConfig;
