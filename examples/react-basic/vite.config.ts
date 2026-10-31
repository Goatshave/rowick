import { productionBuild } from "../../scripts/vite-production.mjs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { datasourceApiPlugin } from "../shared-server/src/datasource-api-server";
import { analyticsApiPlugin } from "../shared-server/src/analytics-api";

export default defineConfig({ build: productionBuild,
  plugins: [react(), datasourceApiPlugin(), analyticsApiPlugin()],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
});
