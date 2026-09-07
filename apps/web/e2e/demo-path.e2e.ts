import { expect, test, type Page } from "@playwright/test";
import { apiUrl, e2eToken } from "../playwright.config";

const headers = { Authorization: `Bearer ${e2eToken}`, "Content-Type": "application/json" };

/**
 * Signs the fixed e2e user in: the API creates it on the first session call, the profile
 * makes it onboarded, and the session cookie is what the web app reads on the server.
 */
test.beforeEach(async ({ context }) => {
  const session = await fetch(`${apiUrl}/auth/session`, { method: "POST", headers });
  expect(session.status, "the API must run with E2E_TEST_TOKEN").toBe(200);
  const profile = await fetch(`${apiUrl}/auth/profile`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ name: "E2E Tester", username: "e2e_tester" }),
  });
  expect([200, 409]).toContain(profile.status);
  await context.addCookies([
    { name: "automator-session", value: e2eToken, domain: "localhost", path: "/" },
  ]);
});

async function createFlow(page: Page) {
  await page.goto("/flows");
  await page.getByRole("link", { name: "New flow" }).first().click();
  await expect(page).toHaveURL(/\/flows\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}

test("create a flow, simulate it, publish it, and fork the listing", async ({ page }) => {
  await createFlow(page);

  // An empty canvas offers the mini-app trigger; one node is a complete flow.
  await page.getByRole("button", { name: "Add a mini-app trigger" }).click();
  await expect(page.getByText("Mini-app opened", { exact: true }).first()).toBeVisible();

  // Simulate: the run panel reports the outcome and the trigger card its status.
  await page.getByRole("button", { name: "Simulate" }).click();
  const runPanel = page.getByRole("region", { name: "Last run" });
  await expect(runPanel).toContainText("Succeeded");
  await expect(runPanel).toContainText("Mini-app opened");

  // Save, then publish the saved version.
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  const dialog = page.getByRole("dialog");
  const name = `E2E flow ${Date.now()}`;
  await dialog.getByLabel("Listing name").fill(name);
  await dialog.getByLabel("Description").fill("Published by the end-to-end suite.");
  await dialog.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(dialog).toContainText("Published to the marketplace");
  const listingHref = await dialog.getByRole("link", { name: "View listing" }).getAttribute("href");
  expect(listingHref).toMatch(/^\/marketplace\//);

  // The listing is browsable under Yours and shows the read-only graph.
  await page.goto("/marketplace");
  await page.getByRole("button", { name: "Yours" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await page.goto(listingHref!);
  await expect(page.getByRole("img", { name: `Graph of ${name}` })).toBeVisible();

  // Fork lands on a new canvas with the copied trigger.
  await page.getByRole("link", { name: `Fork flow: ${name}` }).click();
  await expect(page).toHaveURL(/\/flows\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Mini-app opened", { exact: true }).first()).toBeVisible();

  // Leave the marketplace as it was found: unpublish through the API.
  const slug = listingHref!.split("/").pop()!;
  const removed = await fetch(`${apiUrl}/marketplace/${slug}`, { method: "DELETE", headers });
  expect(removed.status).toBe(200);
});
