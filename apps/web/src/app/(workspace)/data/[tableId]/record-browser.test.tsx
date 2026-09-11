/// <reference types="bun" />
import type { DataRecord, DataTable } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act } from "react";
import type { Root } from "react-dom/client";
import { navigationModule } from "../../../../auth/test-navigation";
import type { RecordQuery } from "./record-query";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

mock.module("../../../../auth/access-token", () => ({
  e2eSession: false,
  useAccessToken: () => async () => "privy-token",
}));
mock.module("next/navigation", () => navigationModule);

const { createRoot } = await import("react-dom/client");
const { RecordBrowser } = await import("./record-browser");
const { forgetColumnPreferences } = await import("./column-preferences");

const wallet = `0x${"ab".repeat(20)}`;

const table: DataTable = {
  id: "tbl-1",
  name: "Signups",
  columns: [
    { id: "email", name: "Email", type: "text", required: true },
    { id: "invited", name: "Invited", type: "checkbox", required: false },
    { id: "wallet", name: "Wallet", type: "address", required: false },
    { id: "note", name: "Note", type: "text", required: false },
  ],
  recordCount: 1,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-08T10:00:00.000Z",
};

const record: DataRecord = {
  id: "rec-1",
  tableId: "tbl-1",
  values: { email: "a@b.co", invited: false, wallet },
  createdAt: "2026-09-08T10:00:00.000Z",
  updatedAt: "2026-09-08T10:00:00.000Z",
};

/* The switcher's list: one other table is enough to show the section's navigation is in it. */
const tables: readonly DataTable[] = [
  table,
  { ...table, id: "tbl-2", name: "Applicants", recordCount: 12 },
];

const originalFetch = globalThis.fetch;
let calls: Array<{ url: string; method: string; body?: unknown }>;
let answer: () => Response | Promise<Response>;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  forgetColumnPreferences();
  calls = [];
  answer = () => Response.json({ id: record.id });
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      ...(init?.body ? { body: JSON.parse(String(init.body)) as unknown } : {}),
    });
    return answer();
  }) as typeof fetch;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  globalThis.fetch = originalFetch;
});

afterAll(() => GlobalRegistrator.unregister());

async function mount(records: readonly DataRecord[] | null, query: RecordQuery = { filters: [] }) {
  await act(async () => {
    root.render(
      <RecordBrowser
        table={table}
        tables={tables}
        records={records}
        query={query}
        retryHref="/data/tbl-1"
      />,
    );
  });
}

/** A control by its accessible name. The checkbox primitive is a span with role, not a button. */
function control(label: string) {
  const match = document.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  if (!match) throw new Error(`Missing control: ${label}`);
  return match;
}

function button(label: string) {
  const match = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (node) => node.textContent?.trim() === label || node.getAttribute("aria-label") === label,
  );
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}

test("each value is shown in the form its column reads best", async () => {
  await mount([record]);
  const row = document.querySelector("tbody tr")!;
  expect(row.textContent).toContain("a@b.co");
  // A checkbox column is a control rather than text, so it reads and edits in one place.
  expect(
    row.querySelector('[aria-label="Invited of this record"]')?.getAttribute("data-checked"),
  ).toBeNull();
  expect(row.textContent).toContain("0xabab…abab");
  // The record has no note, and an absent value is a dash rather than an empty cell.
  expect(row.textContent).toContain("—");
});

test("editing a cell patches only that column and keeps the saved value on the page", async () => {
  answer = () =>
    Response.json({
      ...record,
      values: { ...record.values, note: "Called back" },
      updatedAt: "2026-09-08T11:00:00.000Z",
    });
  await mount([record]);

  await act(async () => button("Edit Note of this record").click());
  const input = document.querySelector<HTMLInputElement>(
    'input[aria-label="Note of this record"]',
  )!;
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(
    input,
    "Called back",
  );
  const key = Object.keys(input).find((name) => name.startsWith("__reactProps"))!;
  const props = (input as unknown as Record<string, { onChange(event: unknown): void }>)[key]!;
  await act(async () => props.onChange({ target: input, currentTarget: input }));
  await act(async () =>
    input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
  );

  expect(calls).toEqual([
    {
      url: "/api/data/tables/tbl-1/records/rec-1",
      method: "PATCH",
      body: {
        values: { note: "Called back" },
        merge: true,
        expectedUpdatedAt: record.updatedAt,
      },
    },
  ]);
  expect(document.querySelector("tbody tr")!.textContent).toContain("Called back");
});

test("a table with no records offers to add the first one", async () => {
  await mount([]);
  expect(container.textContent).toContain("No records yet");
  // Adding is a link now, because the new record opens in the panel beside the grid.
  const add = Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).filter(
    (node) => node.getAttribute("href") === "/data/tbl-1/new",
  );
  expect(add.length).toBeGreaterThan(0);
});

test("a records outage keeps the table's actions and offers a retry", async () => {
  await mount(null);
  expect(container.textContent).toContain("Records could not load");
  expect(document.querySelector("form")?.getAttribute("action")).toBe("/data/tbl-1");
  expect(button("Table actions")).toBeDefined();
  expect(button("Signups — switch table")).toBeDefined();
});

test("every row can be opened in the panel, carrying the query it was found under", async () => {
  await mount([record], { filters: [], search: "ada" });
  const open = document.querySelector<HTMLAnchorElement>('a[aria-label="Open record 1"]');
  expect(open?.getAttribute("href")).toBe("/data/tbl-1/rec-1?q=ada");
});

test("a filter is shown as what it says, with a way to take it off", async () => {
  await mount([record], {
    filters: [{ column: "email", operator: "contains", value: "ada" }],
  });
  expect(container.textContent).toContain("Email contains ada");
  expect(button("Remove the filter on Email")).toBeDefined();
});

test("a narrowed list that hit the cap says so instead of implying it is the whole table", async () => {
  await act(async () => {
    root.render(
      <RecordBrowser
        table={table}
        tables={tables}
        records={[record]}
        query={{ filters: [], search: "a" }}
        truncated
        retryHref="/data/tbl-1"
      />,
    );
  });
  expect(container.textContent).toContain("The first 100 matches");
});

test("a narrowed list that matches nothing offers to clear the filters, not to add a record", async () => {
  await mount([], { filters: [{ column: "email", operator: "contains", value: "zz" }] });
  expect(container.textContent).toContain("No records match");
  expect(container.textContent).toContain("Clear filters");
});

test("deleting the table reads as destructive in its menu, like deleting a flow", async () => {
  await mount([record]);
  await act(async () => button("Table actions").click());
  const item = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
    (node) => node.textContent?.trim() === "Delete table",
  );
  if (!item) throw new Error("Missing menu item: Delete table");
  expect(item.getAttribute("data-variant")).toBe("destructive");
});

/** Opens a menu by the label of its trigger and answers with the items it holds. */
async function openMenu(label: string) {
  await act(async () => button(label).click());
  return Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));
}

async function clickItem(label: string, text: string) {
  const item = (await openMenu(label)).find((node) => node.textContent?.trim() === text);
  if (!item) throw new Error(`Missing menu item: ${text}`);
  await act(async () => item.click());
}

test("the title bar switches tables, so the section needs no rail of its own", async () => {
  await mount([record]);
  const items = await openMenu("Signups — switch table");
  expect(items.map((node) => node.textContent)).toEqual([
    expect.stringContaining("Signups"),
    expect.stringContaining("Applicants"),
    expect.stringContaining("New table"),
  ]);
  const applicants = items.find((node) => node.textContent?.includes("Applicants"));
  expect(
    applicants?.querySelector("a")?.getAttribute("href") ?? applicants?.getAttribute("href"),
  ).toBe("/data/tbl-2");
});

test("selecting rows says how many and offers to delete them", async () => {
  await mount([record]);
  expect(container.textContent).not.toContain("record selected");

  await act(async () => control("Select record 1").click());
  expect(container.textContent).toContain("1 record selected");

  await act(async () => button("Delete").click());
  expect(document.body.textContent).toContain("Delete this record?");

  await act(async () => button("Delete record").click());
  expect(calls).toEqual([{ url: "/api/data/tables/tbl-1/records/rec-1", method: "DELETE" }]);
});

test("clearing the selection puts the toolbar back", async () => {
  await mount([record]);
  await act(async () => control("Select record 1").click());
  await act(async () => button("Clear").click());
  expect(container.textContent).not.toContain("record selected");
});

test("a column hidden from its header leaves a chip that brings it back", async () => {
  await mount([record]);
  expect(document.querySelectorAll("thead th").length).toBe(table.columns.length + 2);

  await clickItem("Note column options", "Hide column");
  expect(document.querySelectorAll("thead th").length).toBe(table.columns.length + 1);
  expect(container.textContent).toContain("Note hidden");

  await act(async () => button("Note hidden").click());
  expect(document.querySelectorAll("thead th").length).toBe(table.columns.length + 2);
});

test("a hidden column is this viewer's own preference, not a change to the table", async () => {
  await mount([record]);
  await clickItem("Note column options", "Hide column");
  expect(JSON.parse(localStorage.getItem("automator:data-columns:tbl-1")!)).toEqual({
    hidden: ["note"],
    widths: {},
  });
  // Hiding a column asks the API for nothing: the table itself is untouched.
  expect(calls).toEqual([]);
});

test("the order a column offers is named after what the column holds", async () => {
  await mount([record]);
  expect(
    (await openMenu("Invited column options")).map((node) => node.textContent?.trim()),
  ).toEqual([
    "Unchecked first",
    "Checked first",
    "Filter by this column…",
    "Rename column…",
    "Hide column",
    "Delete column…",
  ]);
});

test("a column's width is a handle the keyboard can move, stored for this viewer only", async () => {
  await mount([record]);
  const handle = control("Email column width");
  expect(handle.getAttribute("aria-valuenow")).toBe("220");

  await act(async () =>
    handle.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })),
  );
  expect(control("Email column width").getAttribute("aria-valuenow")).toBe("236");
  expect(JSON.parse(localStorage.getItem("automator:data-columns:tbl-1")!).widths).toEqual({
    email: 236,
  });
  expect(calls).toEqual([]);
});

test("the last column has no handle: there is nothing on its right to push against", async () => {
  await mount([record]);
  expect(document.querySelector('[aria-label="Note column width"]')).toBeNull();
});
