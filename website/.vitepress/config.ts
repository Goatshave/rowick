import { fileURLToPath } from "node:url";
import { defineConfig } from "vitepress";
import { previewExamples } from "./preview-examples.ts";

export default defineConfig({
  title: "Rowick",
  description: "Typed data grids for React, Vue, and Svelte. A shared headless engine, with a UI that feels at home.",
  lang: "en-US",
  base: "/rowick/",
  srcDir: "../docs",
  // Maintainer procedures and the repository index are read directly on GitHub.
  srcExclude: ["maintainers/**", "README.md"],
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/rowick/symbol.svg" }],
    ["meta", { name: "theme-color", content: "#f6f4ef" }],
  ],
  vite: {
    plugins: [previewExamples()],
    publicDir: fileURLToPath(new URL("../.generated/public", import.meta.url)),
    resolve: {
      // Build and development share the repository's current CSS. Runtime APIs
      // still come from the published packages pinned in website/package.json.
      alias: {
        vue: fileURLToPath(new URL("../node_modules/vue", import.meta.url)),
        "@rowick/theme/css": fileURLToPath(new URL("../../packages/theme/src/index.css", import.meta.url)),
        "@rowick/vue-ui/css": fileURLToPath(new URL("../../packages/react-ui/src/index.css", import.meta.url)),
      },
      dedupe: ["vue"],
    },
    ssr: { noExternal: ["@rowick/vue-ui", "@rowick/vue", "@rowick/core", "@rowick/primitives", "@rowick/virtual"] },
  },
  themeConfig: {
    siteTitle: false,
    logo: { light: "/logo.svg", dark: "/logo-dark.svg", alt: "Rowick" },
    nav: [
      { text: "Guide", link: "/getting-started", activeMatch: "/(getting-started|react-ui|vue-ui|svelte-ui)" },
      { text: "Examples", link: "/examples" },
      { text: "Packages", link: "/packages" },
      { text: "0.1.1", items: [
        { text: "0.1.1 · latest release", link: "https://github.com/Goatshave/rowick/releases/tag/rowick-v0.1.1" },
        { text: "Changelog", link: "https://github.com/Goatshave/rowick/blob/main/CHANGELOG.md" },
        { text: "Validation scope", link: "/0.1.1-validation" },
      ] },
    ],
    sidebar: [
      { text: "Start here", items: [
        { text: "Getting started", link: "/getting-started" },
        { text: "Choose your packages", link: "/packages" },
        { text: "Examples", link: "/examples" },
      ] },
      { text: "Feature examples", collapsed: false, items: [
        { text: "Shared setup", link: "/examples/setup" },
        { text: "Sorting", link: "/examples/sorting" },
        { text: "Filtering", link: "/examples/filtering" },
        { text: "Row selection", link: "/examples/selection" },
        { text: "Pagination", link: "/examples/pagination" },
        { text: "Cell editing", link: "/examples/editing" },
        { text: "Column visibility & pinning", link: "/examples/columns" },
        { text: "CSV export", link: "/examples/export" },
      ] },
      { text: "Your framework", items: [
        { text: "React", link: "/react-ui" },
        { text: "Vue", link: "/vue-ui" },
        { text: "Svelte", link: "/svelte-ui" },
        { text: "Custom rendering", link: "/custom-rendering" },
        { text: "Product composition", link: "/composition" },
      ] },
      { text: "Work with data", collapsed: false, items: [
        { text: "Typed column filters", link: "/filters" },
        { text: "Advanced filters & saved views", link: "/filtering" },
        { text: "Cell, row & batch editing", link: "/row-editing" },
        { text: "Immutable transactions", link: "/transactions" },
        { text: "Server data", link: "/server-data" },
        { text: "Remote datasource & recovery", link: "/datasource" },
        { text: "Layout, ranges & clipboard", link: "/layout" },
        { text: "Pivot & file export", link: "/analytics-export" },
        { text: "Localization", link: "/localization" },
        { text: "Persisted preferences", link: "/preferences" },
      ] },
      { text: "Reference", collapsed: false, items: [
        { text: "State & lifecycle", link: "/state-lifecycle" },
        { text: "Architecture", link: "/architecture" },
        { text: "API stability", link: "/api-stability" },
        { text: "Feature boundaries", link: "/feature-boundaries" },
        { text: "0.1.1 validation scope", link: "/0.1.1-validation" },
      ] },
    ],
    search: { provider: "local" },
    socialLinks: [{ icon: "github", link: "https://github.com/Goatshave/rowick" }],
    outline: { level: [2, 3], label: "On this page" },
    editLink: { pattern: "https://github.com/Goatshave/rowick/edit/main/docs/:path", text: "Edit this page on GitHub" },
    footer: { message: "Released under the MIT License.", copyright: "© 2026 Rowick contributors" },
  },
});
