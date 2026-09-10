import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import type {
  DataRecord,
  DataTable,
  DataTableInput,
  FlowDocumentInput,
  FlowRecord,
  ListDataTablesResponse,
} from "@automator/contracts";
import { apiUrl, e2eToken } from "../playwright.config";

const headers = { Authorization: `Bearer ${e2eToken}`, "Content-Type": "application/json" };
const createdFlows: string[] = [];

async function signIn(context: BrowserContext) {
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
}

/** The test identity owns nothing but fixtures, so every spec can start from an empty section. */
async function clearTables() {
  const response = await fetch(`${apiUrl}/data/tables`, { headers });
  expect(response.status).toBe(200);
  const { tables } = (await response.json()) as ListDataTablesResponse;
  for (const table of tables) {
    const removed = await fetch(`${apiUrl}/data/tables/${table.id}?confirm=1`, {
      method: "DELETE",
      headers,
    });
    expect([200, 404]).toContain(removed.status);
  }
}

async function seedTable(name: string, columns: DataTableInput["columns"]): Promise<DataTable> {
  const response = await fetch(`${apiUrl}/data/tables`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name, description: "E2E local fixture", columns }),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as DataTable;
}

async function seedRecord(tableId: string, values: Record<string, unknown>): Promise<DataRecord> {
  const response = await fetch(`${apiUrl}/data/tables/${tableId}/records`, {
    method: "POST",
    headers,
    body: JSON.stringify({ values }),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as DataRecord;
}

async function seedFlow(
  name: string,
  nodes: FlowDocumentInput["nodes"],
  edges: FlowDocumentInput["edges"] = [],
) {
  const response = await fetch(`${apiUrl}/flows`, {
    method: "POST",
    headers,
    body: JSON.stringify({ version: 1, name, description: "E2E local fixture", nodes, edges }),
  });
  expect(response.status).toBe(201);
  const record = (await response.json()) as FlowRecord;
  createdFlows.push(record.flow.id);
  return record.flow;
}

/** Every record of a table, read back through the API rather than off the page. */
async function readRecords(tableId: string): Promise<readonly DataRecord[]> {
  const response = await fetch(`${apiUrl}/data/tables/${tableId}/records?limit=100`, { headers });
  expect(response.status).toBe(200);
  return ((await response.json()) as { records: DataRecord[] }).records;
}

/** The record rows of the table on screen, counted by the control that opens each one. */
function recordRows(page: Page) {
  return page.getByRole("link", { name: /^Open record / });
}

/** The record panel beside the grid, which is where a whole record is read and edited. */
function recordPanel(page: Page, name: string | RegExp) {
  return page.getByRole("complementary", { name });
}

test.beforeEach(async ({ context }) => {
  await signIn(context);
  await clearTables();
});

test.afterEach(async () => {
  for (const id of createdFlows.splice(0)) {
    const response = await fetch(`${apiUrl}/flows/${id}`, { method: "DELETE", headers });
    expect([200, 404]).toContain(response.status);
  }
  await clearTables();
});

test("the empty data section creates its first table through the dialog", async ({ page }) => {
  await page.goto("/data");
  await expect(page.getByRole("heading", { name: "Create your first table" })).toBeVisible();
  await page.getByRole("button", { name: "Create a table", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "New table" });
  const name = `E2E signups ${Date.now()}`;
  // The table's own name and every column's name share the label "Name", so this one is by id.
  await dialog.locator("#data-table-name").fill(name);
  await dialog.locator("#data-table-description").fill("Created by the end-to-end suite.");
  // A column is a fieldset whose legend is not its accessible name, so columns are read in order.
  const columns = dialog.getByRole("group");
  await columns.nth(0).getByLabel("Name", { exact: true }).fill("Email");
  await dialog.getByRole("button", { name: "Add column", exact: true }).click();
  const second = columns.nth(1);
  await second.getByLabel("Name", { exact: true }).fill("Signed up");
  await second.getByRole("combobox", { name: "Type", exact: true }).click();
  await page.getByRole("option", { name: "Date & time", exact: true }).click();
  await expect(second.getByRole("combobox", { name: "Type", exact: true })).toContainText(
    "Date & time",
  );
  await dialog.getByRole("button", { name: "Create table", exact: true }).click();

  await expect(page).toHaveURL(/\/data\/[^/?]+$/);
  await expect(page.getByRole("heading", { name: "No records yet" })).toBeVisible();
  await page.goto("/data");
  await page.getByRole("searchbox", { name: "Search tables" }).fill(name);
  const card = page.getByRole("article").filter({ hasText: name });
  await expect(card).toBeVisible();
  // The card leads with the columns it was given and counts them.
  await expect(card).toContainText("Email");
  await expect(card).toContainText("Signed up");
  await expect(card).toContainText("2 columns");
  // The rail carries the same table, so moving between tables never needs the gallery.
  await expect(page.getByRole("navigation", { name: "Tables" })).toContainText(name);
});

/* The rail is rendered by data/layout.tsx, which a push between the layout's own children does
 * not re-run, so a created table used to reach the pane and not the rail until a reload. */
test("a created table reaches the rail without a reload", async ({ page }) => {
  const first = await seedTable(`E2E first ${Date.now()}`, [
    { id: "email", name: "Email", type: "text", required: true },
  ]);
  await page.goto("/data");
  const rail = page.getByRole("navigation", { name: "Tables" });
  await expect(rail).toContainText(first.name);

  // The rail's own New table button, which the layout renders ahead of the gallery's.
  await page.getByRole("button", { name: "New table", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "New table" });
  const name = `E2E second ${Date.now()}`;
  await dialog.locator("#data-table-name").fill(name);
  await dialog.getByRole("group").nth(0).getByLabel("Name", { exact: true }).fill("Title");
  await dialog.getByRole("button", { name: "Create table", exact: true }).click();

  await expect(page).toHaveURL(/\/data\/[^/?]+$/);
  // No goto here: the rail has to carry the new table on the navigation the dialog made.
  await expect(rail).toContainText(name);
  await expect(rail.getByRole("link", { name: new RegExp(name) })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("a record is added, edited and deleted from the record panel", async ({ page }) => {
  const table = await seedTable(`E2E people ${Date.now()}`, [
    { id: "email", name: "Email", type: "text", required: true },
    { id: "score", name: "Score", type: "number", required: false },
    { id: "active", name: "Active", type: "checkbox", required: false },
    { id: "tier", name: "Tier", type: "select", required: false, options: ["gold", "silver"] },
    { id: "wallet", name: "Wallet", type: "address", required: false },
  ]);
  const email = `member-${Date.now()}@example.test`;
  await page.goto(`/data/${table.id}`);
  await expect(page.getByRole("heading", { name: "No records yet" })).toBeVisible();

  await page.getByRole("link", { name: "Add record", exact: true }).first().click();
  await expect(page).toHaveURL(/\/data\/[^/?]+\/new$/);
  const adding = recordPanel(page, "New record");
  await adding.getByLabel("Email", { exact: true }).fill(email);
  await adding.getByLabel("Score", { exact: true }).fill("42");
  await adding.getByRole("switch", { name: "Active", exact: true }).click();
  await adding.getByRole("combobox", { name: "Tier", exact: true }).click();
  await page.getByRole("option", { name: "Silver", exact: true }).click();
  await adding
    .getByLabel("Wallet", { exact: true })
    .fill("0x1111111111111111111111111111111111111111");
  await adding.getByRole("button", { name: "Add record", exact: true }).click();
  await expect(adding).not.toBeVisible();

  const row = page.getByRole("row").filter({ hasText: email });
  await expect(row).toContainText("42");
  await expect(row).toContainText("silver");
  await expect(row).toContainText("0x1111…1111");
  // A checkbox column is a control in the grid rather than text, so it is read by its state.
  const active = row.getByRole("checkbox", { name: "Active of this record" });
  await expect(active).toBeChecked();

  await page.getByRole("link", { name: "Open record 1", exact: true }).click();
  const editing = recordPanel(page, `Record: ${email}`);
  await editing.getByLabel("Score", { exact: true }).fill("7");
  await editing.getByRole("switch", { name: "Active", exact: true }).click();
  await editing.getByRole("button", { name: "Save record", exact: true }).click();
  // Saving keeps the record open; the grid behind it catches up.
  await expect(row.getByRole("cell").filter({ hasText: /^7$/ })).toBeVisible();
  await expect(active).not.toBeChecked();
  await editing.getByRole("link", { name: "Close panel", exact: true }).click();
  await expect(editing).not.toBeVisible();

  await page.getByRole("link", { name: "Open record 1", exact: true }).click();
  const open = recordPanel(page, `Record: ${email}`);
  await open.getByRole("button", { name: "Record actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete record", exact: true }).click();
  const removing = page.getByRole("dialog", { name: "Delete this record?" });
  await removing.getByRole("button", { name: "Delete record", exact: true }).click();
  await expect(removing).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "No records yet" })).toBeVisible();
  expect(await readRecords(table.id)).toHaveLength(0);
});

test("a full page of records links to the rest", async ({ page }) => {
  const table = await seedTable(`E2E paging ${Date.now()}`, [
    { id: "label", name: "Label", type: "text", required: true },
  ]);
  for (let index = 1; index <= 30; index += 1)
    await seedRecord(table.id, { label: `Record ${String(index).padStart(2, "0")}` });

  await page.goto(`/data/${table.id}`);
  await expect(recordRows(page)).toHaveCount(25);
  await expect(page.getByRole("link", { name: "First page", exact: true })).toHaveCount(0);

  await page.getByRole("link", { name: "Older records", exact: true }).click();
  await expect(page).toHaveURL(/\/data\/[^/?]+\?cursor=/);
  await expect(recordRows(page)).toHaveCount(5);
  await expect(page.getByRole("link", { name: "Older records", exact: true })).toHaveCount(0);

  await page.getByRole("link", { name: "First page", exact: true }).click();
  await expect(recordRows(page)).toHaveCount(25);
});

test("deleting a table a flow uses asks twice and names the flow", async ({ page }) => {
  const table = await seedTable(`E2E in use ${Date.now()}`, [
    { id: "note", name: "Note", type: "text", required: false },
  ]);
  const flowName = `E2E writer ${Date.now()}`;
  await seedFlow(flowName, [
    {
      id: "write",
      type: "data.create-record",
      position: { x: 0, y: 0 },
      label: "Create record",
      config: { tableId: table.id, values: [{ column: "note", value: "hello" }] },
    },
  ]);

  await page.goto(`/data/${table.id}`);
  await page.getByRole("button", { name: "Table actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete table", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: `Delete “${table.name}”?` });
  await dialog.getByRole("button", { name: "Delete table", exact: true }).click();

  const inUse = page.getByRole("dialog", { name: `“${table.name}” is still in use` });
  await expect(inUse).toContainText("These flows use this table:");
  await expect(inUse.getByRole("link", { name: flowName, exact: true })).toBeVisible();
  const stillThere = await fetch(`${apiUrl}/data/tables/${table.id}`, { headers });
  expect(stillThere.status).toBe(200);

  await inUse.getByRole("button", { name: "Delete anyway", exact: true }).click();
  await expect(page).toHaveURL(/\/data$/);
  const gone = await fetch(`${apiUrl}/data/tables/${table.id}`, { headers });
  expect(gone.status).toBe(404);
});

test("a create-record flow writes nothing in simulate and one record live", async ({ page }) => {
  const table = await seedTable(`E2E flow writes ${Date.now()}`, [
    { id: "note", name: "Note", type: "text", required: true },
  ]);
  const flow = await seedFlow(
    `E2E flow writes ${Date.now()}`,
    [
      {
        id: "start",
        type: "trigger.manual",
        position: { x: 0, y: 0 },
        label: "Run",
        config: {},
      },
      {
        id: "write",
        type: "data.create-record",
        position: { x: 320, y: 0 },
        label: "Create record",
        config: { tableId: table.id, values: [{ column: "note", value: "Written by the flow" }] },
      },
    ],
    [{ id: "start-write", source: "start", target: "write", sourceHandle: "run" }],
  );

  await page.goto(`/flows/${flow.id}`);
  const runPanel = page.getByRole("region", { name: "Last run" });
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(runPanel).toContainText("Succeeded");
  expect(await readRecords(table.id)).toHaveLength(0);

  await page.getByRole("button", { name: "Flow settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Flow settings" });
  await settings.getByRole("switch", { name: "Send real transactions", exact: true }).click();
  await settings.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(settings).not.toBeVisible();

  await page.getByRole("button", { name: "Run live", exact: true }).click();
  // The first live run of a session is confirmed before anything is signed or written.
  const confirmLive = page.getByRole("alertdialog", { name: "Run this flow for real?" });
  await confirmLive.getByRole("button", { name: "Run live", exact: true }).click();
  await expect(confirmLive).not.toBeVisible();
  await expect(runPanel).toContainText("Succeeded");
  const written = await readRecords(table.id);
  expect(written).toHaveLength(1);
  expect(written[0]?.values.note).toBe("Written by the flow");
});
