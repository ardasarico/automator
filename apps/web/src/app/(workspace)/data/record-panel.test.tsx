/// <reference types="bun" />
import type { DataRecord, DataTable } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act } from "react";
import type { Root } from "react-dom/client";
import { navigation, navigationModule } from "../../../auth/test-navigation";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

mock.module("../../../auth/access-token", () => ({
  e2eSession: false,
  useAccessToken: () => async () => "privy-token",
}));
mock.module("next/navigation", () => navigationModule);

const { createRoot } = await import("react-dom/client");
const { RecordPanel } = await import("./record-panel");

const table: DataTable = {
  id: "tbl-1",
  name: "Signups",
  columns: [
    { id: "email", name: "Email", type: "text", required: true },
    { id: "plan", name: "Plan", type: "select", required: false, options: ["Free", "Pro"] },
    { id: "invited", name: "Invited", type: "checkbox", required: false },
  ],
  recordCount: 1,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-08T10:00:00.000Z",
};

const record: DataRecord = {
  id: "rec-1",
  tableId: "tbl-1",
  values: { email: "ada@lovelace.dev", plan: "Pro", invited: true },
  createdAt: "2026-09-08T10:00:00.000Z",
  updatedAt: "2026-09-08T10:00:00.000Z",
};

const originalFetch = globalThis.fetch;
let calls: Array<{ url: string; method: string; body?: unknown }>;
let answer: () => Response | Promise<Response>;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  navigation.reset();
  calls = [];
  answer = () => Response.json(record);
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

async function mount(open?: DataRecord) {
  await act(async () => {
    root.render(<RecordPanel table={table} record={open} closeHref="/data/tbl-1" />);
  });
}

/** Drains the promise chain a click starts: the request is recorded well before it finishes. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function button(label: string) {
  const match = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (node) => node.textContent?.trim() === label || node.getAttribute("aria-label") === label,
  );
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}

test("every column is a labelled field, so a wide table is readable one record at a time", async () => {
  await mount(record);
  expect(container.textContent).toContain("Email");
  expect(container.textContent).toContain("Plan");
  expect(container.textContent).toContain("Invited");
  expect(document.querySelector<HTMLInputElement>("#panel-email")?.value).toBe("ada@lovelace.dev");
});

test("the panel is titled by the record, and can be closed by a link", async () => {
  await mount(record);
  expect(container.textContent).toContain("ada@lovelace.dev");
  const close = document.querySelector<HTMLAnchorElement>('a[aria-label="Close panel"]');
  expect(close?.getAttribute("href")).toBe("/data/tbl-1");
});

test("with no record the panel creates one and says so", async () => {
  await mount();
  expect(container.textContent).toContain("New record");
  expect(button("Add record")).toBeDefined();
  // Nothing to delete yet, so the record menu is not offered.
  expect(document.querySelector('[aria-label="Record actions"]')).toBeNull();
});

test("saving an edit sends the updatedAt the reader saw, so a stale write is refused", async () => {
  await mount(record);
  await act(async () => button("Save record").click());
  expect(calls).toEqual([
    {
      url: "/api/data/tables/tbl-1/records/rec-1",
      method: "PATCH",
      body: {
        values: { email: "ada@lovelace.dev", plan: "Pro", invited: true },
        expectedUpdatedAt: record.updatedAt,
      },
    },
  ]);
});

test("a record another writer changed is reported rather than overwritten", async () => {
  await mount(record);
  answer = () => Response.json({ error: "conflict" }, { status: 409 });
  await act(async () => button("Save record").click());
  expect(document.querySelector("[role=alert]")?.textContent).toContain("changed elsewhere");
});

test("deleting asks first and only then sends the request", async () => {
  // The delete endpoint answers with the id alone, and the client checks the shape it gets.
  answer = () => Response.json({ id: record.id });
  await mount(record);
  await act(async () => button("Record actions").click());
  const item = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
    (node) => node.textContent?.trim() === "Delete record",
  );
  if (!item) throw new Error("Missing menu item: Delete record");
  await act(async () => item.click());
  expect(document.querySelector("[data-slot=dialog-title]")?.textContent).toBe(
    "Delete this record?",
  );
  expect(calls).toEqual([]);

  const confirm = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).filter(
    (node) => node.textContent?.trim() === "Delete record",
  );
  await act(async () => confirm[confirm.length - 1]!.click());
  await settle();
  expect(calls).toEqual([{ url: "/api/data/tables/tbl-1/records/rec-1", method: "DELETE" }]);
  // Deleting closes the panel, which is a navigation back to the grid.
  expect(navigation.replaced).toContain("/data/tbl-1");
});
