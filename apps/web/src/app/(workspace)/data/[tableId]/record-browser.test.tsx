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

const originalFetch = globalThis.fetch;
let calls: Array<{ url: string; method: string; body?: unknown }>;
let answer: () => Response | Promise<Response>;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
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
      <RecordBrowser table={table} records={records} query={query} retryHref="/data/tbl-1" />,
    );
  });
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
  expect(button("Edit columns")).toBeDefined();
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
        records={[record]}
        query={{ filters: [], search: "a" }}
        truncated
        retryHref="/data/tbl-1"
      />,
    );
  });
  expect(container.textContent).toContain("Showing the first 100 matches");
});

test("a narrowed list that matches nothing offers to clear the filters, not to add a record", async () => {
  await mount([], { filters: [{ column: "email", operator: "contains", value: "zz" }] });
  expect(container.textContent).toContain("No records match");
  expect(container.textContent).toContain("Clear filters");
});
