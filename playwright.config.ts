import { defineConfig, devices } from "@playwright/test";

declare const process: { readonly env: { readonly SMOKE_PORT?: string } };

const smokePort = process.env.SMOKE_PORT ?? "4321";
const baseURL = `http://127.0.0.1:${smokePort}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  webServer: {
    command: "exec node scripts/start-smoke-server.mjs",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: {
    baseURL,
    headless: true,
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        channel: "chrome",
      },
    },
  ],
});
