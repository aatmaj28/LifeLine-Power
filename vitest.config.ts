import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirror the tsconfig `@/*` path alias so test files (and the source modules
  // they import) can use `@/lib/...` imports the same way the app does.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  // Use the React 19 automatic JSX runtime for .tsx component/axe tests so
  // they do not need an explicit `import React`.
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  test: {
    include: [
      "lib/**/__tests__/**/*.test.ts",
      "lib/**/*.{test,property}.ts",
      "{app,components}/**/*.{test,property}.{ts,tsx}",
      "lib/app/**/*.{test,property}.{ts,tsx}",
    ],
    globals: true,
    // Default to the node environment so the existing risk-engine suite keeps
    // running under node. Component, page, and axe tests opt into jsdom via the
    // globs below.
    environment: "node",
    environmentMatchGlobs: [
      ["**/*.tsx", "jsdom"],
      ["{app,components}/**/*.{test,property}.ts", "jsdom"],
      ["lib/app/**/*.{test,property}.ts", "jsdom"],
    ],
    setupFiles: ["./vitest.setup.ts"],
  },
});
