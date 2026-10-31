import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import serverData from "./playwright.server-data.config";
import { createPlaywrightWebServers } from "./scripts/ui-smoke-targets.mjs";

// Playwright #42768: keep macOS Firefox app metadata separate from the user's
// protected Firefox data. Browser security settings and user profiles stay intact.
const ownsFirefoxAppData = process.platform === "darwin" && !process.env.ROWICK_TEST_FIREFOX_HOME;
const firefoxAppData = process.platform === "darwin" ? process.env.ROWICK_TEST_FIREFOX_HOME ?? mkdtempSync(join(tmpdir(), "rowick-firefox-app-data-")) : undefined;
if (firefoxAppData) process.env.ROWICK_TEST_FIREFOX_HOME = firefoxAppData;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /(framework-integration|transactions|row-editing|filtering|datasource|analytics|locale|layout|features-display)\.spec\.ts/,
  timeout: 40_000,
  expect: { timeout: 7_000 },
  workers: 3,
  metadata: { firefoxAppData, ownsFirefoxAppData },
  globalTeardown: "./scripts/e2e-integration-teardown.mjs",
  use: { trace: "retain-on-failure" },
  webServer: [...createPlaywrightWebServers(), ...(Array.isArray(serverData.webServer) ? serverData.webServer : [])],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"], ...(firefoxAppData ? { launchOptions: { env: { ...process.env, CFFIXED_USER_HOME: firefoxAppData } } } : {}) } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
