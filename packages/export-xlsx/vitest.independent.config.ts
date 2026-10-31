import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({ resolve: { alias: { "@rowick/data/analytics": fileURLToPath(new URL("../data/src/analytics.ts", import.meta.url)) } }, test: { include: ["test/independent-reader.test.ts"] } });
