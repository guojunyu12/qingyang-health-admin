import { defineConfig } from "@playwright/test";

if (!process.env.ADMIN_LIVE_FIXTURE_FILE || !process.env.ADMIN_LIVE_MAIL_FILE) {
  throw Error("Live tests require explicit isolated fixture and local test-mail files.");
}
const port = Number(process.env.ADMIN_E2E_PORT || 4303);
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.live.spec.ts",
  workers: 1,
  timeout: 120000,
  expect: { timeout: 15000 },
  use: { channel: "chrome", baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1280, height: 900 }, trace: "retain-on-failure" },
  webServer: {
    command: `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`, reuseExistingServer: false,
  },
  reporter: "list",
});
