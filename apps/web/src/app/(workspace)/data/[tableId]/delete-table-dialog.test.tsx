/// <reference types="bun" />
import type { DataTable } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act } from "react";
import type { Root } from "react-dom/client";
import { navigation, navigationModule } from "../../../../auth/test-navigation";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

mock.module("../../../../auth/access-token", () => ({
  e2eSession: false,
  useAccessToken: () => async () => "privy-token",
}));
mock.module("next/navigation", () => navigationModule);

const { createRoot } = await import("react-dom/client");
const { DeleteTableDialog } = await import("./delete-table-dialog");

const table: DataTable = {
  id: "tbl-1",
  name: "Signups",
  columns: [{ id: "email", name: "Email", type: "text", required: true }],
  recordCount: 3,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-08T10:00:00.000Z",
};

const originalFetch = globalThis.fetch;
let calls: string[];
let answer: () => Response | Promise<Response>;
let closed: number;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  calls = [];
  closed = 0;
  navigation.reset();
  answer = () => Response.json({ deleted: true, usedBy: [] });
  globalThis.fetch = (async (url: string | URL) => {
    calls.push(String(url));
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

async function mount() {
  await act(async () => {
    root.render(<DeleteTableDialog table={table} onClose={() => closed++} />);
  });
}

function button(label: string) {
  const match = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (node) => node.textContent?.trim() === label || node.getAttribute("aria-label") === label,
  );
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}

test("an unused table is deleted on the first confirmation", async () => {
  await mount();
  expect(document.querySelector("[data-slot=dialog-title]")?.textContent).toBe("Delete “Signups”?");
  await act(async () => button("Delete table").click());
  expect(calls).toEqual(["/api/data/tables/tbl-1"]);
  expect(navigation.replaced).toEqual(["/data"]);
});

test("a table flows still read from names them before it can be deleted", async () => {
  await mount();
  answer = () =>
    Response.json({ deleted: false, usedBy: [{ id: "flow-1", name: "Weekly payout" }] });
  await act(async () => button("Delete table").click());
  expect(document.body.textContent).toContain("These flows use this table:");
  expect(document.querySelector<HTMLAnchorElement>('a[href="/flows/flow-1"]')?.textContent).toBe(
    "Weekly payout",
  );
  expect(navigation.replaced).toEqual([]);

  answer = () => Response.json({ deleted: true, usedBy: [] });
  await act(async () => button("Delete anyway").click());
  expect(calls).toEqual(["/api/data/tables/tbl-1", "/api/data/tables/tbl-1?confirm=1"]);
  expect(navigation.replaced).toEqual(["/data"]);
});

test("a failed delete stays open with its reason and keeps the table", async () => {
  await mount();
  answer = () => Response.json({ error: "unavailable" }, { status: 503 });
  await act(async () => button("Delete table").click());
  expect(document.querySelector("[role=alert]")?.textContent).toBe(
    "The table could not be deleted. Please try again.",
  );
  expect(navigation.replaced).toEqual([]);
  await act(async () => button("Keep table").click());
  expect(closed).toBe(1);
});
