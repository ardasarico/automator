import { expect, test, type Page } from "@playwright/test";
import { apiUrl, e2eToken } from "../playwright.config";

const headers = { Authorization: `Bearer ${e2eToken}`, "Content-Type": "application/json" };

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
  await page.getByRole("button", { name: "New flow" }).first().click();
  await expect(page).toHaveURL(/\/flows\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}

test("create a flow, simulate it, publish it, and fork the listing", async ({ page }) => {
  await createFlow(page);

  await page.getByRole("button", { name: "Add a mini-app trigger" }).click();
  await expect(page.getByText("Mini-app opened", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Simulate" }).click();
  const runPanel = page.getByRole("region", { name: "Last run" });
  await expect(runPanel).toContainText("Succeeded");
  await expect(runPanel).toContainText("Mini-app opened");

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

  await page.goto("/marketplace");
  await page.getByRole("button", { name: "Yours" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await page.goto(listingHref!);
  await expect(page.getByRole("img", { name: `Graph of ${name}` })).toBeVisible();

  await page.getByRole("button", { name: `Fork flow: ${name}` }).click();
  await expect(page).toHaveURL(/\/flows\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Mini-app opened", { exact: true }).first()).toBeVisible();

  const slug = listingHref!.split("/").pop()!;
  const removed = await fetch(`${apiUrl}/marketplace/${slug}`, { method: "DELETE", headers });
  expect(removed.status).toBe(200);
});
