import { defineConfig } from "@playwright/test";

const port = Number(process.env.ADMIN_E2E_PORT || 4303);
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.fixture.spec.ts",
  fullyParallel: false,
  workers: 1,
  use: {
    channel: "chrome",
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
  reporter: "list",
});
