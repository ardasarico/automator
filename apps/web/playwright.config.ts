import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests for the core demo path. They start their own web and API dev servers on
 * ports 3100 and 3101, so a developer's servers on 3000/3001 keep running untouched; the API
 * gets `E2E_TEST_TOKEN`, which it accepts as the fixed user did:privy:e2e (never in
 * production). Both servers still need the usual env files (`apps/api/.env`,
 * `apps/web/.env.local`) for the database and the public Privy app id.
 */
export const e2eToken = process.env.E2E_TEST_TOKEN ?? "automator-e2e-token";
export const apiUrl = "http://localhost:3101";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.e2e\.ts$/,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  projects: [{ name: "chromium" }],
  webServer: [
    {
      command: "bun run --cwd ../api dev",
      url: `${apiUrl}/health/live`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { PORT: "3101", E2E_TEST_TOKEN: e2eToken },
    },
    {
      command: "bunx next dev --port 3100",
      url: "http://localhost:3100/health",
      timeout: 180_000,
      reuseExistingServer: false,
      env: { API_URL: apiUrl, NEXT_PUBLIC_E2E_TOKEN: e2eToken },
    },
  ],
});
