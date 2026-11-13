import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Only for the Fashionpedia check (npm run fashionpedia), which needs the
// downloaded data and so isn't part of `npm test`.
export default defineConfig({
  root: fileURLToPath(new URL("../..", import.meta.url)),
  resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) } },
  test: { include: ["scripts/fashionpedia/check.test.ts"], silent: false, testTimeout: 600_000 },
});
