import { defineConfig, devices } from "@playwright/test";

/* TEST_DATABASE_URL must name an isolated database; DATABASE_URL can point at production. */
export const e2eToken = process.env.E2E_TEST_TOKEN ?? "automator-e2e-token";
const apiPort = process.env.E2E_API_PORT ?? "3101";
const webPort = process.env.E2E_WEB_PORT ?? "3100";
export const apiUrl = `http://localhost:${apiPort}`;
/*
 * With E2E_API_PROXY=1 the web server reaches the API through a pass-through that one test can
 * tell to fail a route, so a browser can be shown what an unreachable API looks like. Off by
 * default: the suite then points straight at the API and starts nothing extra.
 */
const proxyPort = process.env.E2E_PROXY_PORT ?? "3102";
export const proxyUrl = `http://localhost:${proxyPort}`;
export const proxied = process.env.E2E_API_PROXY === "1";
const webApiUrl = proxied ? proxyUrl : apiUrl;
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
      env: {
        PORT: apiPort,
        E2E_TEST_TOKEN: e2eToken,
        DATABASE_URL: databaseUrl,
        // The AI suite needs the same draft every run, and no test should call a real model.
        AI_SCRIPTED_MODEL: "1",
        // Seeding a page boundary of records writes far faster than a person does.
        RATE_LIMIT_DATA: "600",
      },
    },
    {
      command: `bunx next dev --port ${webPort}`,
      url: `http://localhost:${webPort}/health`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        API_URL: webApiUrl,
        NEXT_PUBLIC_E2E_TOKEN: e2eToken,
        E2E_NEXT_DIST_DIR: "e2e/.next",
      },
    },
    ...(proxied
      ? [
          {
            command: "bun run e2e/support/api-proxy.ts",
            url: `${proxyUrl}/__fault`,
            timeout: 30_000,
            reuseExistingServer: false,
            env: { E2E_PROXY_TARGET: apiUrl, E2E_PROXY_PORT: proxyPort },
          },
        ]
      : []),
  ],
});
