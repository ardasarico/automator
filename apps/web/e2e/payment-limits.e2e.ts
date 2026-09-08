import { expect, test } from "@playwright/test";
import type { PaymentPolicyState } from "@automator/contracts";
import { apiUrl, e2eToken } from "../playwright.config";

test("wallet limits save immediately and preserve edits during a pending save", async ({
  page,
  context,
}) => {
  const headers = { Authorization: `Bearer ${e2eToken}`, "Content-Type": "application/json" };
  expect((await fetch(`${apiUrl}/auth/session`, { method: "POST", headers })).status).toBe(200);
  expect(
    (
      await fetch(`${apiUrl}/auth/profile`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ name: "E2E Tester", username: "e2e_tester" }),
      })
    ).status,
  ).toBe(200);
  await context.addCookies([
    { name: "automator-session", value: e2eToken, domain: "localhost", path: "/" },
  ]);
  let state: PaymentPolicyState = {
    policy: { enabled: false, recipients: [], limits: [] },
    day: "2026-09-08",
    usage: [{ chainId: 84532, asset: "usdc", reserved: "3.25" }],
  };
  let failRead = false;
  let releaseSave: (() => void) | undefined;
  let pendingSave: Promise<void> | undefined;
  // Policy writes are browser fixtures: no account policy, budget or transaction is changed.
  await page.route("**/api/wallet/payment-policy", async (route) => {
    if (failRead) return route.fulfill({ status: 503, json: { error: "unavailable" } });
    if (route.request().method() === "PUT") {
      const policy = route.request().postDataJSON();
      await pendingSave;
      state = { ...state, policy };
    }
    await route.fulfill({ json: state });
  });
  await page.goto("/wallet");
  await page.getByRole("button", { name: "Add asset limit" }).click();
  await page.getByLabel("Per transfer (ETH)", { exact: true }).fill("0.1");
  await page.getByLabel("Per UTC day (ETH)", { exact: true }).fill("0.5");
  await page.getByRole("switch", { name: "Enable payment limits" }).click();
  await page.getByRole("button", { name: "Save limits" }).click();
  await expect(page.getByText("Payment limits saved.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Per transfer (ETH)", { exact: true })).toHaveValue("0.1");
  await expect(page.getByText("Base Sepolia · 3.25 USDC", { exact: true })).toBeVisible();
  await page.getByLabel("Per transfer (ETH)", { exact: true }).fill("0");
  await expect(page.getByRole("button", { name: "Save limits" })).toBeDisabled();
  await page.getByLabel("Per transfer (ETH)", { exact: true }).fill("0.2");
  pendingSave = new Promise((resolve) => {
    releaseSave = resolve;
  });
  await page.getByRole("button", { name: "Save limits" }).click();
  await page.getByLabel("Per transfer (ETH)", { exact: true }).fill("0.3");
  releaseSave!();
  await expect(
    page.getByText("Earlier changes saved. Your latest edits are still unsaved.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Per transfer (ETH)", { exact: true })).toHaveValue("0.3");
  await page.setViewportSize({ width: 390, height: 844 });
  const collapse = page.getByRole("button", { name: "Collapse sidebar", exact: true });
  if (await collapse.isVisible()) await collapse.click();
  await page.getByLabel("Allowed recipients", { exact: true }).fill("invalid");
  await expect(page.getByRole("button", { name: "Save limits" })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  failRead = true;
  await page.reload();
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  failRead = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Enable payment limits" })).toBeVisible();
});
