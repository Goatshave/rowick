import { productionBuild } from "../../scripts/vite-production.mjs";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({ build: productionBuild,
  plugins: [svelte()],
});
