import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Tests live outside src/app, where every file would become a route.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["tests/**/*.test.ts"] },
});
