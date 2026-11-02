import { fileURLToPath } from "node:url";
import { defineConfig } from "vitepress";

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
    publicDir: fileURLToPath(new URL("../../assets/brand", import.meta.url)),
    resolve: {
      alias: { vue: fileURLToPath(new URL("../node_modules/vue", import.meta.url)) },
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
      { text: "0.1.0", items: [
        { text: "0.1.0 · latest release", link: "https://github.com/Goatshave/rowick/releases/tag/rowick-v0.1.0" },
        { text: "Changelog", link: "https://github.com/Goatshave/rowick/blob/main/CHANGELOG.md" },
        { text: "Validation scope", link: "/initial-release-validation" },
      ] },
    ],
    sidebar: [
      { text: "Start here", items: [
        { text: "Getting started", link: "/getting-started" },
        { text: "Choose your packages", link: "/packages" },
        { text: "Live example", link: "/examples" },
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
        { text: "0.1.0 validation scope", link: "/initial-release-validation" },
      ] },
    ],
    search: { provider: "local" },
    socialLinks: [{ icon: "github", link: "https://github.com/Goatshave/rowick" }],
    outline: { level: [2, 3], label: "On this page" },
    editLink: { pattern: "https://github.com/Goatshave/rowick/edit/main/docs/:path", text: "Edit this page on GitHub" },
    footer: { message: "Released under the MIT License.", copyright: "© 2026 Rowick contributors" },
  },
});
