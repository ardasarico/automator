import { expect, test, type Page } from "@playwright/test";
import type { FlowRecord } from "@automator/contracts";
import { apiUrl, e2eToken } from "../playwright.config";

const headers = { Authorization: `Bearer ${e2eToken}`, "Content-Type": "application/json" };
let flow: FlowRecord["flow"];

test.beforeEach(async ({ context }) => {
  await fetch(`${apiUrl}/auth/session`, { method: "POST", headers });
  await fetch(`${apiUrl}/auth/profile`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ name: "E2E Tester", username: "e2e_tester" }),
  });
  await context.addCookies([
    { name: "automator-session", value: e2eToken, domain: "localhost", path: "/" },
  ]);
  const response = await fetch(`${apiUrl}/flows`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      version: 1,
      name: `E2E traversal ${Date.now()}`,
      description: "Local history fixture",
      nodes: [],
      edges: [],
    }),
  });
  expect(response.status).toBe(201);
  flow = ((await response.json()) as FlowRecord).flow;
});

test.afterEach(async () => {
  if (flow) await fetch(`${apiUrl}/flows/${flow.id}`, { method: "DELETE", headers });
});

const confirmation = (page: Page) =>
  page.getByRole("alertdialog", { name: "Leave without saving?" });

async function historySnapshot(page: Page) {
  return page.evaluate(() => ({
    length: history.length,
    key: navigation.currentEntry?.key,
    index: navigation.currentEntry?.index,
    entries: navigation.entries().map(({ key, url }) => ({ key, url })),
    state: history.state,
  }));
}

async function openCanvas(page: Page) {
  await page.goto("/flows");
  await page.getByRole("searchbox", { name: "Search flows" }).fill(flow.name);
  await page.locator(`a[href="/flows/${flow.id}"]`).click();
  await expect(page.getByRole("button", { name: "Flow settings", exact: true })).toBeVisible();
}

async function traverse(page: Page, direction: "back" | "forward") {
  // Issue the same browser command as the Back/Forward buttons, without waiting for
  // a load event: a correctly canceled navigation must never emit one.
  const client = await page.context().newCDPSession(page);
  try {
    const { currentIndex, entries } = await client.send("Page.getNavigationHistory");
    const entry = entries[currentIndex + (direction === "back" ? -1 : 1)];
    expect(entry).toBeDefined();
    await client.send("Page.navigateToHistoryEntry", { entryId: entry!.id });
  } finally {
    await client.detach();
  }
}

for (const direction of ["back", "forward"] as const) {
  test(`browser ${direction}: repeated Stay preserves history; Leave reaches original entry`, async ({
    page,
  }) => {
    await openCanvas(page);
    if (direction === "forward") {
      await page.getByRole("link", { name: "Leave flow", exact: true }).click();
      await expect(page).toHaveURL(/\/flows$/);
      await traverse(page, "back");
      await expect(page).toHaveURL(new RegExp(`/flows/${flow.id}$`));
    }
    await page.getByRole("button", { name: "Add a mini-app trigger" }).click();
    const before = await historySnapshot(page);
    const target = before.entries[(before.index ?? 0) + (direction === "back" ? -1 : 1)];
    expect(before.state.__NA).toBe(true);
    for (let i = 0; i < 3; i++) {
      await traverse(page, direction);
      await expect(confirmation(page)).toBeVisible();
      await confirmation(page).getByRole("button", { name: "Stay", exact: true }).click();
      await expect(confirmation(page)).not.toBeVisible();
      expect(await historySnapshot(page)).toEqual(before);
      await expect(page.getByText("Mini-app opened", { exact: true }).first()).toBeVisible();
    }
    await traverse(page, direction);
    await confirmation(page).getByRole("button", { name: "Leave", exact: true }).click();
    await expect(page).toHaveURL(target!.url!);
    const after = await historySnapshot(page);
    expect(after.key).toBe(target!.key);
    expect(after.entries).toEqual(before.entries);
    expect(after.length).toBe(before.length);
    expect(after.state.__NA).toBe(true);
  });
}

test("browser traversal saves before leaving and a failed save retains the pending destination", async ({
  page,
}) => {
  await openCanvas(page);
  await page.getByRole("button", { name: "Add a mini-app trigger" }).click();
  const before = await historySnapshot(page);
  await traverse(page, "back");
  await page.route(`**/api/flows/${flow.id}`, async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({ status: 503, json: { message: "Local save failure" } });
    else await route.continue();
  });
  await confirmation(page).getByRole("button", { name: "Save and leave", exact: true }).click();
  await expect(confirmation(page).getByRole("alert")).toBeVisible();
  expect(await historySnapshot(page)).toEqual(before);
  await page.unroute(`**/api/flows/${flow.id}`);
  await confirmation(page).getByRole("button", { name: "Save and leave", exact: true }).click();
  await expect(page).toHaveURL(/\/flows$/);
  expect((await historySnapshot(page)).entries).toEqual(before.entries);
  const saved = await fetch(`${apiUrl}/flows/${flow.id}`, { headers });
  expect(((await saved.json()) as FlowRecord).flow.nodes).toHaveLength(1);
});

test("clean canvas Back and Forward traverse normally without confirmation or history pollution", async ({
  page,
}) => {
  await openCanvas(page);
  const before = await historySnapshot(page);
  for (let i = 0; i < 2; i++) {
    await traverse(page, "back");
    await expect(page).toHaveURL(/\/flows$/);
    await expect(confirmation(page)).not.toBeVisible();
    await traverse(page, "forward");
    await expect(page).toHaveURL(new RegExp(`/flows/${flow.id}$`));
    await expect(page.getByRole("button", { name: "Flow settings", exact: true })).toBeVisible();
    expect(await historySnapshot(page)).toEqual(before);
  }
});
