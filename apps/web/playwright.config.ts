import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests for the core demo path. They start their own web and API dev servers on
 * ports 3100 and 3101, so a developer's servers on 3000/3001 keep running untouched; the API
 * gets `E2E_TEST_TOKEN`, which it accepts as the fixed user did:privy:e2e (never in
 * production). TEST_DATABASE_URL must identify an isolated test database; never inherit
 * the API's usual DATABASE_URL, which can point at production. The public Privy app id
 * can still come from apps/web/.env.local.
 */
export const e2eToken = process.env.E2E_TEST_TOKEN ?? "automator-e2e-token";
const apiPort = process.env.E2E_API_PORT ?? "3101";
const webPort = process.env.E2E_WEB_PORT ?? "3100";
export const apiUrl = `http://localhost:${apiPort}`;
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "Set TEST_DATABASE_URL to an isolated PostgreSQL database before running e2e tests.",
  );
}

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
    baseURL: `http://localhost:${webPort}`,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  projects: [{ name: "chromium" }],
  webServer: [
    {
      command: "bun run --cwd ../api src/index.ts",
      url: `${apiUrl}/health/live`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { PORT: apiPort, E2E_TEST_TOKEN: e2eToken, DATABASE_URL: databaseUrl },
    },
    {
      command: `bunx next dev --port ${webPort}`,
      url: `http://localhost:${webPort}/health`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        API_URL: apiUrl,
        NEXT_PUBLIC_E2E_TOKEN: e2eToken,
        E2E_NEXT_DIST_DIR: "e2e/.next",
      },
    },
  ],
});
