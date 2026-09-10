import { expect, test, type BrowserContext } from "@playwright/test";
import { apiUrl, e2eToken, proxied, proxyUrl } from "../playwright.config";

const headers = { Authorization: `Bearer ${e2eToken}`, "Content-Type": "application/json" };

/*
 * Needs the pass-through in front of the API, which only starts with E2E_API_PROXY=1:
 *   E2E_API_PROXY=1 TEST_DATABASE_URL=… bunx playwright test action-failure.e2e.ts
 * Without it there is no way to make one route fail while sign-in keeps working.
 */
test.skip(!proxied, "run with E2E_API_PROXY=1");

async function signIn(context: BrowserContext) {
  const session = await fetch(`${apiUrl}/auth/session`, { method: "POST", headers });
  expect(session.status).toBe(200);
  const profile = await fetch(`${apiUrl}/auth/profile`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ name: "E2E Tester", username: "e2e_tester" }),
  });
  expect(profile.status).toBe(200);
  await context.addCookies([
    { name: "automator-session", value: e2eToken, domain: "localhost", path: "/" },
  ]);
}

const fault = (body: string | null) =>
  fetch(`${proxyUrl}/__fault`, body === null ? { method: "DELETE" } : { method: "POST", body });

test.beforeEach(async ({ context }) => {
  await signIn(context);
  await fault(null);
});
test.afterEach(() => fault(null));

/*
 * Production QA lost a New flow click to a 503 from our own redeploy and saw nothing at all: no
 * message, no pending state, nothing in the console. The click has to come back with a reason.
 */
test("New flow says so when the API is briefly unavailable, and can be retried", async ({
  page,
}) => {
  await page.goto("/flows");
  const button = page.getByRole("button", { name: "New flow", exact: true });
  await expect(button).toBeVisible();

  await fault("POST /flows");
  await button.click();
  // Next's route announcer is also role=alert, so this asks for the one carrying the reason.
  const failure = page.getByRole("alert").filter({ hasText: "Automator is unavailable" });
  await expect(failure).toHaveText("Automator is unavailable right now. Try again shortly.");
  // Still on the list, and the button is ready for the retry the message asks for.
  await expect(page).toHaveURL(/\/flows(\?|$)/);
  await expect(button).toBeEnabled();

  // The retry works once the API is back, which is what makes the message honest.
  await fault(null);
  await button.click();
  await expect(page).toHaveURL(/\/flows\/[^/?]+/, { timeout: 30_000 });
});
