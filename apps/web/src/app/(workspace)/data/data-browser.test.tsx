/// <reference types="bun" />
import type { DataTable } from "@automator/contracts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, expect, mock, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { navigationModule } from "../../../auth/test-navigation";

// Base UI reads whether a DOM exists when it is first imported, and these modules are shared with
// the DOM tests in this directory; registering first keeps their portals working in any file order.
GlobalRegistrator.register();
mock.module("next/navigation", () => navigationModule);

const { DataBrowser } = await import("./data-browser");

afterAll(() => GlobalRegistrator.unregister());

const signups: DataTable = {
  id: "tbl-signups",
  name: "Signups",
  description: "Everyone who asked for an invite.",
  columns: [
    { id: "email", name: "Email", type: "text", required: true },
    { id: "invited", name: "Invited", type: "checkbox", required: false },
  ],
  recordCount: 12,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-08T10:00:00.000Z",
};

const payouts: DataTable = {
  id: "tbl-payouts",
  name: "Payouts",
  columns: [{ id: "wallet", name: "Wallet", type: "address", required: true }],
  recordCount: 0,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-02T10:00:00.000Z",
};

test("an owner with no tables is offered one action, not a table", () => {
  const html = renderToString(<DataBrowser tables={[]} />);
  expect(html).toContain("Create your first table");
  expect(html).toContain("Create a table");
  expect(html).not.toContain("<table");
  expect(html).not.toContain("New table");
});

test("each table links to its records and counts its columns and records", () => {
  const html = renderToString(<DataBrowser tables={[signups]} />);
  expect(html).toContain('href="/data/tbl-signups"');
  expect(html).toContain("Signups");
  expect(html).toContain("Everyone who asked for an invite.");
  expect(html).toContain("12 records");
  expect(html).toContain("2 columns");
  // The date is the shared LocalDate: UTC on the server, with the exact stamp on the element.
  expect(html).toContain('<time dateTime="2026-09-08T10:00:00.000Z">Sep 8, 2026</time>');
});

test("a card leads with the table's own columns and their types", () => {
  const html = renderToString(<DataBrowser tables={[signups]} />);
  expect(html).toContain("Email");
  expect(html).toContain("Invited");
  expect(html).toContain("text");
  expect(html).toContain("checkbox");
});

test("a card counts the columns it had no room for", () => {
  const wide = {
    ...signups,
    columns: ["a", "b", "c", "d", "e", "f"].map((id) => ({
      id,
      name: id.toUpperCase(),
      type: "text" as const,
      required: false,
    })),
  };
  const html = renderToString(<DataBrowser tables={[wide]} />);
  expect(html).toContain("2 more columns");
  // The fifth column onwards is counted, not drawn.
  expect(html).not.toContain(">F<");
});

test("a table with no columns still has a face", () => {
  const html = renderToString(<DataBrowser tables={[{ ...signups, columns: [] }]} />);
  expect(html).toContain("No columns yet");
  expect(html).toContain("0 columns");
});

test("tables are listed by last edited first", () => {
  const html = renderToString(<DataBrowser tables={[payouts, signups]} />);
  expect(html.indexOf("tbl-signups")).toBeLessThan(html.indexOf("tbl-payouts"));
});
