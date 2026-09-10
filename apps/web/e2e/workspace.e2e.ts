import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import type { FlowDocumentInput, FlowRecord } from "@automator/contracts";
import { apiUrl, e2eToken } from "../playwright.config";

const headers = { Authorization: `Bearer ${e2eToken}`, "Content-Type": "application/json" };
const createdFlows: string[] = [];

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

async function seedFlow(name: string, nodes: FlowDocumentInput["nodes"] = []) {
  const response = await fetch(`${apiUrl}/flows`, {
    method: "POST",
    headers,
    body: JSON.stringify({ version: 1, name, description: "E2E local fixture", nodes, edges: [] }),
  });
  expect(response.status).toBe(201);
  const record = (await response.json()) as FlowRecord;
  createdFlows.push(record.flow.id);
  return record.flow;
}

async function renameFlow(page: Page, name: string) {
  await page.getByRole("button", { name: "Flow settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Flow settings" });
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await dialog.getByLabel("Description", { exact: true }).fill("Saved from browser coverage.");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
}

test.beforeEach(async ({ context }) => signIn(context));
test.afterEach(async () => {
  for (const id of createdFlows.splice(0)) {
    const response = await fetch(`${apiUrl}/flows/${id}`, { method: "DELETE", headers });
    expect([200, 404]).toContain(response.status);
  }
});

test("flow browser searches, preserves its table preference, and confirms deletion", async ({
  page,
}) => {
  const name = `E2E browser ${Date.now()}`;
  const flow = await seedFlow(name);
  await page.goto("/flows");
  await page.getByRole("searchbox", { name: "Search flows" }).fill(name);
  await expect(page.locator(`a[href="/flows/${flow.id}"]`)).toBeVisible();
  await page.getByRole("button", { name: "Table view", exact: true }).click();
  await expect(page.getByRole("button", { name: "Table view", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.reload();
  await expect(page.getByRole("button", { name: "Table view", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("searchbox", { name: "Search flows" }).fill(name);
  const openActions = async () => {
    await page.getByRole("button", { name: `Actions for ${name}`, exact: true }).click();
    await page.getByRole("menuitem", { name: "Delete flow", exact: true }).click();
  };
  await openActions();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(`a[href="/flows/${flow.id}"]`)).toBeVisible();
  await openActions();
  await page.getByRole("dialog").getByRole("button", { name: "Delete flow", exact: true }).click();
  await expect(page.locator(`a[href="/flows/${flow.id}"]`)).toHaveCount(0);
});

test("saved metadata survives reload and history restores an earlier version", async ({ page }) => {
  const original = `E2E original ${Date.now()}`;
  const flow = await seedFlow(original);
  await page.goto(`/flows/${flow.id}`);
  await page.getByRole("button", { name: "Add a mini-app trigger" }).click();
  const updated = `${original} revised`;
  await renameFlow(page, updated);
  await page.reload();
  await expect(page.getByRole("heading", { name: updated, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("button", { name: "Restore v1", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Restored v1. Save to keep it." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: original, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: original, exact: true })).toBeVisible();
});

test("variables validate names, conceal saved values, and delete a local secret", async ({
  page,
}) => {
  const flow = await seedFlow(`E2E variables ${Date.now()}`);
  const name = `e2e_secret_${Date.now()}`;
  await page.goto(`/flows/${flow.id}`);
  await page.getByRole("button", { name: "Variables", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Variables panel" });
  await panel.getByLabel("Name", { exact: true }).fill("Invalid name!");
  await panel.getByLabel("Value", { exact: true }).fill("fake-local-e2e-value");
  await panel.getByRole("button", { name: "Save secret", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Names are lowercase");
  await panel.getByLabel("Name", { exact: true }).fill(name);
  await panel.getByRole("button", { name: "Save secret", exact: true }).click();
  await expect(panel.getByText(`{{secrets.${name}}}`, { exact: true })).toBeVisible();
  await expect(panel.getByLabel("Value", { exact: true })).toHaveValue("");
  await page.reload();
  await page.getByRole("button", { name: "Variables", exact: true }).click();
  await expect(panel.getByText(`{{secrets.${name}}}`, { exact: true })).toBeVisible();
  await expect(panel).not.toContainText("fake-local-e2e-value");
  await panel.getByRole("button", { name: `Delete secret ${name}`, exact: true }).click();
  await expect(panel.getByText(`{{secrets.${name}}}`, { exact: true })).toHaveCount(0);
});

test("a local simulation is inspectable in run history and on its canvas", async ({ page }) => {
  const name = `E2E run ${Date.now()}`;
  const flow = await seedFlow(name, [
    {
      id: "trigger",
      type: "trigger.miniapp-open",
      position: { x: 0, y: 0 },
      label: "Mini-app opened",
      config: {},
    },
  ]);
  await page.goto(`/flows/${flow.id}`);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByRole("region", { name: "Last run" })).toContainText("Succeeded");
  await page.goto(`/runs?flow=${flow.id}`);
  await page.getByRole("link", { name: `${name} run`, exact: true }).click();
  // Opening a run keeps the list's own filter in the URL, so the panel closes back onto it.
  await expect(page).toHaveURL(new RegExp(`/runs/[^/?]+\\?flow=${flow.id}$`));
  await expect(page.getByText("Succeeded", { exact: true }).first()).toBeVisible();
  await page.getByRole("link", { name: "Open on canvas", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/flows/${flow.id}\\?run=`));
  await expect(page.getByRole("region", { name: "Last run" })).toContainText("Succeeded");
});

/* Seeds its run over the API rather than from the canvas, so what it proves is about the list:
 * the row carries the hover highlight, so every cell in it has to open the run, not only the
 * flow name. Keyboard reach stays the one link the row already had. */
test("every cell of a run row opens the run, not only the flow name", async ({ page }) => {
  const name = `E2E row ${Date.now()}`;
  const flow = await seedFlow(name, [
    {
      id: "trigger",
      type: "trigger.manual",
      position: { x: 0, y: 0 },
      label: "Manual",
      config: {},
    },
  ]);
  const run = await fetch(`${apiUrl}/flows/${flow.id}/runs`, {
    method: "POST",
    headers,
    body: JSON.stringify({ trigger: { nodeId: "trigger" } }),
  });
  expect(run.status).toBe(201);

  await page.goto(`/runs?flow=${flow.id}`);
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row.getByRole("link", { name: `${name} run`, exact: true })).toBeVisible();
  // One link per row: the row is reachable by keyboard without repeating itself for a reader.
  await expect(row.getByRole("link")).toHaveCount(1);

  // A click where the reader sees the duration, as far from the flow name as the row goes.
  // Real page coordinates, so what answers it is whatever the browser hit-tests there.
  const duration = await row.getByRole("cell").last().boundingBox();
  if (!duration) throw new Error("The duration cell was not laid out.");
  await page.mouse.click(duration.x + duration.width / 2, duration.y + duration.height / 2);
  await expect(page).toHaveURL(new RegExp(`/runs/[^/?]+\\?flow=${flow.id}$`));
});

test("account settings load every section and the test identity has a clear wallet state", async ({
  page,
}) => {
  await page.goto("/flows");
  await page.getByRole("button", { name: /^Account menu/ }).click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  for (const section of ["Preferences", "Usage", "Account"]) {
    const region = page.getByRole("region", { name: section, exact: true });
    await expect(region.getByRole("heading", { name: section, exact: true })).toBeVisible();
    if (section === "Usage")
      await expect(region.getByText("Runs in the last 30 days", { exact: true })).toBeVisible();
    await expect(region.getByRole("alert")).toHaveCount(0);
  }
  // Secrets and the apps they reach are a page of their own; Preferences only points at it.
  await page.getByRole("link", { name: "Open connections", exact: true }).click();
  await expect(page).toHaveURL(/\/connections$/);
  await expect(page.getByRole("heading", { name: "Secrets", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connected apps", exact: true })).toBeVisible();
  await page.goto("/wallet");
  await expect(page.getByRole("heading", { name: "Embedded wallet", exact: true })).toBeVisible();
  await expect(
    page.getByText("0x000000000000000000000000000000000000e2e1", { exact: true }),
  ).toBeVisible();
});

test("signed-out workspace and canvas requests return to login", async ({ page, context }) => {
  const flow = await seedFlow(`E2E auth ${Date.now()}`);
  await context.clearCookies();
  for (const path of ["/flows", "/runs", "/data", "/wallet", `/flows/${flow.id}`]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
  }
});

test("unsaved navigation can stay or save before leaving the canvas", async ({ page }) => {
  const flow = await seedFlow(`E2E leave ${Date.now()}`);
  await page.goto(`/flows/${flow.id}`);
  await page.getByRole("button", { name: "Add a mini-app trigger" }).click();
  await page.getByRole("link", { name: "Leave flow", exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: "Leave without saving?" });
  await dialog.getByRole("button", { name: "Stay", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/flows/${flow.id}$`));
  await page.getByRole("link", { name: "Leave flow", exact: true }).click();
  await dialog.getByRole("button", { name: "Save and leave", exact: true }).click();
  await expect(page).toHaveURL(/\/flows$/);
  await page.goto(`/flows/${flow.id}`);
  await expect(page.getByText("Mini-app opened", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
});

test("catalog search adds an editable screen and preview can finish and restart", async ({
  page,
}) => {
  const flow = await seedFlow(`E2E preview ${Date.now()}`);
  await page.goto(`/flows/${flow.id}`);
  const nodes = page.getByRole("complementary", { name: "Nodes panel" });
  await nodes.getByRole("searchbox", { name: "Search nodes" }).fill("no-such-e2e-node");
  await expect(nodes.getByText("No nodes match.", { exact: true })).toBeVisible();
  await nodes.getByRole("button", { name: "Clear search", exact: true }).click();
  await nodes.getByRole("searchbox", { name: "Search nodes" }).fill("screen");
  await nodes
    .getByRole("button", {
      name: "Screen Show a screen to the visitor in the mini-app.",
      exact: true,
    })
    .click();
  await nodes.getByLabel("Title", { exact: true }).fill("E2E preview screen");
  await nodes.getByLabel("Body", { exact: true }).fill("Local screen content");
  await page.getByRole("tab", { name: "Screen preview", exact: true }).click();
  const preview = page.getByRole("tabpanel", { name: "Screen preview" });
  await expect(
    preview.getByRole("heading", { name: "E2E preview screen", exact: true }),
  ).toBeVisible();
  await expect(preview).toContainText("Local screen content");
  await preview.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(preview.getByRole("heading", { name: "All done", exact: true })).toBeVisible();
  await preview.getByRole("button", { name: "Restart preview", exact: true }).click();
  await expect(
    preview.getByRole("heading", { name: "E2E preview screen", exact: true }),
  ).toBeVisible();
});
