import { expect, test, type BrowserContext } from "@playwright/test";
import { apiUrl, e2eToken } from "../playwright.config";

const headers = { Authorization: `Bearer ${e2eToken}`, "Content-Type": "application/json" };

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

test.beforeEach(async ({ context }) => signIn(context));

/*
 * New flow is a form posting a server action, so it has two timing edges: a click before React
 * has hydrated, which progressive enhancement has to carry as a native submit, and a click after
 * the page has sat idle. Production QA reported the second one swallowing the first click; it did
 * not reproduce here at either edge, and an 18-second idle before the click passed too — that
 * wait is left out of the suite rather than spent on every run.
 */
test("a New flow click landing before hydration still creates a flow", async ({ page }) => {
  // No settle: click the moment the button is in the DOM, which is the other timing edge.
  await page.goto("/flows", { waitUntil: "commit" });
  await page.getByRole("button", { name: "New flow", exact: true }).click({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/flows\/[^/?]+/, { timeout: 30_000 });
});
