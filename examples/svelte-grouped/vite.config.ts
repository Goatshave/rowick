import { productionBuild } from "../../scripts/vite-production.mjs";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { datasourceApiPlugin } from "../shared-server/src/datasource-api-server";
import { analyticsApiPlugin } from "../shared-server/src/analytics-api";

export default defineConfig({ build: productionBuild,
  plugins: [svelte(), datasourceApiPlugin(), analyticsApiPlugin()],
});
