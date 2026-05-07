import { defineConfig } from "oxlint";
import awesomeness from "oxlint-config-awesomeness";

export default defineConfig({
  extends: [awesomeness],
  overrides: [
    // `new-cap` enforces `new` for PascalCase callables, but several frameworks
    // expose factory functions whose names are PascalCase by convention:
    //   - `Inter` / `Roboto` / etc. from `next/font/google`
    //   - `Scalar` from `@scalar/hono-api-reference`
    // The rule supports an exception list — keep it here (not in awesomeness)
    // because the set is repo-specific.
    {
      files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
      rules: {
        "new-cap": [
          "error",
          {
            capIsNewExceptions: ["Inter", "Scalar"],
          },
        ],
      },
    },
    // butr is a published library that has no shared logger to inject. It uses
    // `console.warn` / `console.error` in error paths (storage failures,
    // connector restoration failures, devtools-only diagnostics) so consumers
    // can see them without us swallowing the error. Same reason for `_`-prefixed
    // internal store methods: a long-standing Zustand convention that keeps
    // implementation details out of the public surface area.
    {
      files: ["packages/butr/src/**/*.ts", "packages/butr/src/**/*.tsx"],
      rules: {
        "no-console": "off",
        "no-underscore-dangle": "off",
      },
    },
  ],
});
