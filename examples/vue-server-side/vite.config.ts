import { productionBuild } from "../../scripts/vite-production.mjs";
import { defineConfig } from "vite";
import { ticketApiPlugin } from "../shared-server/src/ticket-api-server";

export default defineConfig({ build: productionBuild, plugins: [ticketApiPlugin("VUE", { valueBase: 1_200, valueStep: 97, openedMonth: "2026-07" })] });
