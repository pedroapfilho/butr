import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const reactConfig = defineConfig({
  plugins: [react()],
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
      thresholds: {
        branches: 60,
        functions: 70,
        lines: 78,
        statements: 78,
      },
    },
    css: false,
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    passWithNoTests: true,
    setupFiles: ["@repo/config-vitest/setup-react"],
  },
});

export default reactConfig;
