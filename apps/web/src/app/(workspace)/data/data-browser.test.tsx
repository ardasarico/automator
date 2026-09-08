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
  expect(html).toContain(">2<");
  expect(html).toContain(">12<");
  expect(html).toContain("Sep 8, 2026");
});

test("tables are listed by last edited first", () => {
  const html = renderToString(<DataBrowser tables={[payouts, signups]} />);
  expect(html.indexOf("tbl-signups")).toBeLessThan(html.indexOf("tbl-payouts"));
});
