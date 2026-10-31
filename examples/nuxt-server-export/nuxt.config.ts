export default defineNuxtConfig({
  compatibilityDate: "2026-07-16",
  devtools: { enabled: false },
  css: ["~/assets/main.css"],
  build: {
    transpile: ["@rowick/example-shared-server"],
  },
  nitro: {
    preset: "node-server",
  },
  typescript: {
    strict: true,
  },
});
