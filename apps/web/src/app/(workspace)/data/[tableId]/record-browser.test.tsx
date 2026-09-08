/// <reference types="bun" />
import type { DataRecord, DataTable } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act } from "react";
import type { Root } from "react-dom/client";
import { navigationModule } from "../../../../auth/test-navigation";

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

async function mount(records: readonly DataRecord[] | null) {
  await act(async () => {
    root.render(<RecordBrowser table={table} records={records} retryHref="/data/tbl-1" />);
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
  expect(button("Add record")).toBeDefined();
});

test("a records outage keeps the table's actions and offers a retry", async () => {
  await mount(null);
  expect(container.textContent).toContain("Records could not load");
  expect(document.querySelector("form")?.getAttribute("action")).toBe("/data/tbl-1");
  expect(button("Edit columns")).toBeDefined();
});

test("deleting a record asks first and only then sends the request", async () => {
  await mount([record]);
  await act(async () => button("Delete record: a@b.co").click());
  expect(document.querySelector("[data-slot=dialog-title]")?.textContent).toBe(
    "Delete this record?",
  );
  expect(calls).toEqual([]);

  await act(async () => button("Delete record").click());
  expect(calls).toEqual([{ url: "/api/data/tables/tbl-1/records/rec-1", method: "DELETE" }]);
  expect(document.querySelector("[data-slot=dialog-title]")).toBeNull();
});

test("a failed delete keeps the confirmation open with the reason", async () => {
  await mount([record]);
  await act(async () => button("Delete record: a@b.co").click());
  answer = () => Response.json({ error: "unavailable" }, { status: 503 });
  await act(async () => button("Delete record").click());
  expect(document.querySelector("[role=alert]")?.textContent).toBe(
    "The record could not be deleted. Please try again.",
  );
  expect(document.querySelector("[data-slot=dialog-title]")).not.toBeNull();
});
