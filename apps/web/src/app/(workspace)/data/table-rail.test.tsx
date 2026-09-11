/// <reference types="bun" />
import type { DataTable } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { navigation, navigationModule } from "../../../auth/test-navigation";

GlobalRegistrator.register();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
mock.module("next/navigation", () => navigationModule);

const { createRoot } = await import("react-dom/client");
const { TableRail } = await import("./table-rail");

afterAll(() => GlobalRegistrator.unregister());
beforeEach(() => navigation.reset());

const tables: DataTable[] = [
  {
    id: "tbl-signups",
    name: "Signups",
    columns: [{ id: "email", name: "Email", type: "text", required: true }],
    recordCount: 42,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-08T10:00:00.000Z",
  },
  {
    id: "tbl-payouts",
    name: "Payouts",
    columns: [{ id: "wallet", name: "Wallet", type: "address", required: true }],
    recordCount: 0,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-02T10:00:00.000Z",
  },
];

test("every table is a link carrying its record count", () => {
  const html = renderToString(<TableRail tables={tables} defaultState="open" />);
  expect(html).toContain('href="/data/tbl-signups"');
  expect(html).toContain('href="/data/tbl-payouts"');
  expect(html).toContain("Signups");
  expect(html).toContain(">42<");
});

/** The rendered anchors, so an assertion can name the row an attribute belongs to. */
function anchors(html: string): string[] {
  return html.match(/<a\b[^>]*>/g) ?? [];
}

test("the open table is the current page, so it is announced and not just shaded", () => {
  navigation.pathname = "/data/tbl-signups";
  const html = renderToString(<TableRail tables={tables} defaultState="open" />);
  const marked = anchors(html).filter((tag) => tag.includes('aria-current="page"'));
  expect(marked).toHaveLength(1);
  expect(marked[0]).toContain("/data/tbl-signups");
});

test("a record open in the panel still marks its table as current", () => {
  navigation.pathname = "/data/tbl-signups/rec-1";
  const html = renderToString(<TableRail tables={tables} defaultState="open" />);
  expect(html).toContain('aria-current="page"');
});

test("with no tables the rail still offers to create one", () => {
  const html = renderToString(<TableRail tables={[]} defaultState="open" />);
  expect(html).toContain("New table");
});

test("collapsed, the tables stay reachable through a menu rather than disappearing", () => {
  const html = renderToString(<TableRail tables={tables} defaultState="collapsed" />);
  expect(html).toContain('aria-label="Choose a table"');
  // The list itself is gone; the menu is what carries the navigation.
  expect(html).not.toContain('href="/data/tbl-payouts"');
});

test("the collapsed menu lists every table as a link to its records", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<TableRail tables={tables} defaultState="collapsed" />));
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="Choose a table"]')!.click(),
  );
  const items = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[role="menuitem"]'));
  expect(items.map((item) => item.getAttribute("href"))).toEqual([
    "/data/tbl-signups",
    "/data/tbl-payouts",
  ]);
  await act(async () => root.unmount());
  container.remove();
});
