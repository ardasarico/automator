import { expect, test } from "@playwright/test";
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

/* The API runs with AI_SCRIPTED_MODEL=1, so every turn drafts the same manual-trigger flow. */
test("a Home prompt streams a draft into the builder and Apply lands it", async ({ page }) => {
  await page.goto("/?draft=1");
  await page.getByLabel("Describe the flow you want").fill("Post hi to Discord when I run it");
  await page.getByRole("button", { name: "Open on the canvas" }).click();
  await expect(page).toHaveURL(/\/flows\/[0-9a-f-]{36}\?ai=1$/);

  const log = page.getByRole("log", { name: "AI conversation" });
  await expect(log).toContainText("Adding a manual trigger");
  /* The step list folds into its summary when the turn ends, so open it to read the calls. */
  const proposal = log.getByRole("region", { name: "Proposed flow" });
  await expect(proposal).toBeVisible();
  await log.getByRole("button", { name: /steps?$/ }).click();
  await expect(log.getByRole("listitem").filter({ hasText: "Connect" })).toBeVisible();

  /* A fresh flow has an empty canvas, so the draft is offered as changes rather than a replacement.
     Applying records the state in the background, and a reload would abort that request, so the
     test waits for it the way a reader who pauses to look at the canvas does. */
  const recorded = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      /\/ai\/messages\/[0-9a-f-]{36}$/.test(response.url()),
  );
  await proposal.getByRole("button", { name: "Apply changes" }).click();
  await expect(page.getByText("Post to Discord", { exact: true }).first()).toBeVisible();
  await expect(log).toContainText("Applied");
  expect((await recorded).status()).toBe(200);

  await page.reload();
  await expect(page.getByRole("log", { name: "AI conversation" })).toContainText("Applied");
});
