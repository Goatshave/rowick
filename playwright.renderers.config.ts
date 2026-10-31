import { defineConfig, devices } from "@playwright/test";
import { getE2eUrl, withE2ePortOffset } from "./scripts/e2e-ports.mjs";

const rendererServers = [
  {
    command:
      "pnpm --filter @rowick/react-ui build && pnpm --filter @rowick/example-react-basic build && pnpm --filter @rowick/example-react-basic preview --port 4173",
    url: "http://127.0.0.1:4173",
  },
  {
    command:
      "pnpm --filter @rowick/vue-ui build && pnpm --filter @rowick/example-vue-grouped build && pnpm --filter @rowick/example-vue-grouped preview --port 4174",
    url: "http://127.0.0.1:4174",
  },
  {
    command:
      "pnpm --filter @rowick/svelte-ui build && pnpm --filter @rowick/example-svelte-grouped build && pnpm --filter @rowick/example-svelte-grouped preview --port 4175",
    url: "http://127.0.0.1:4175",
  },
  {
    command:
      "pnpm --filter @rowick/react-ui build && pnpm --filter @rowick/example-react-server-side build && pnpm --filter @rowick/example-react-server-side preview --port 4178",
    url: "http://127.0.0.1:4178",
  },
  {
    command:
      "pnpm --filter @rowick/vue-ui build && pnpm --filter @rowick/example-vue-server-side build && pnpm --filter @rowick/example-vue-server-side preview --port 4179",
    url: "http://127.0.0.1:4179",
  },
  {
    command:
      "pnpm --filter @rowick/svelte-ui build && pnpm --filter @rowick/example-svelte-server-side build && pnpm --filter @rowick/example-svelte-server-side preview --port 4180",
    url: "http://127.0.0.1:4180",
  },
];

export default defineConfig({
  testDir: "./e2e",
  testMatch: /(react|vue|svelte)-grid\.spec\.ts/,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: getE2eUrl(4173),
    trace: "on-first-retry",
  },
  webServer: rendererServers.map((server) => ({
    command: withE2ePortOffset(server.command),
    url: withE2ePortOffset(server.url),
    reuseExistingServer: false,
    timeout: 120_000,
  })),
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
