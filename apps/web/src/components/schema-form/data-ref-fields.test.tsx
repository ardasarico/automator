/// <reference types="bun" />
import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

/*
 * The table pickers read `useDataTables`, so the suite has to mock it. It runs in a child process
 * to keep that mock out of Bun's shared module registry, the way `canvas-header.test.tsx` does.
 */
test("the table and column pickers read the account's tables", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "-e",
      `
        import assert from "node:assert/strict";
        import { GlobalRegistrator } from "@happy-dom/global-registrator";
        import { mock } from "bun:test";
        import { act, createElement } from "react";
        import { createRoot } from "react-dom/client";

        GlobalRegistrator.register();
        Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

        const column = (id, name) => ({ id, name, type: "text", required: false });
        const table = (id, name, columns) => ({
          id,
          name,
          columns,
          recordCount: 0,
          createdAt: "2026-09-08T00:00:00.000Z",
          updatedAt: "2026-09-08T00:00:00.000Z",
        });
        const customers = table("tbl_customers", "Customers", [
          column("email", "Email"),
          column("plan", "Plan"),
        ]);

        let state = { tables: [], loading: false, error: null, refresh: async () => {} };
        mock.module("../../data/tables-context", () => ({ useDataTables: () => state }));

        const { conditionOperators, findRecordsConfigSchema } = await import("@automator/contracts");
        const { ConfigField, ObjectFields } = await import("./fields");

        let container;
        let root;
        const render = async (element) => {
          container = window.document.createElement("div");
          window.document.body.append(container);
          root = createRoot(container);
          await act(async () => root.render(element));
        };
        const unmount = async () => {
          await act(async () => root.unmount());
          container.remove();
        };
        const control = (id) => container.querySelector("#" + id);
        const disabled = (id) => control(id).hasAttribute("data-disabled");
        const open = async (id) => {
          await act(async () => control(id).click());
        };
        const optionLabels = () =>
          [...window.document.querySelectorAll("[data-slot=select-item]")].map(
            (node) => node.textContent,
          );
        const pick = async (label) => {
          const item = [...window.document.querySelectorAll("[data-slot=select-item]")].find(
            (node) => node.textContent === label,
          );
          assert.ok(item, "no option labelled " + label);
          await act(async () => item.click());
        };

        const tableField = (value, onChange = () => {}) =>
          createElement(ConfigField, {
            id: "n-tableId",
            name: "tableId",
            property: { type: "string", tableRef: true },
            value,
            onChange,
          });

        // A picker with tables shows their names and hands back the id of the one chosen.
        state = { ...state, tables: [customers, table("tbl_orders", "Orders", [])] };
        let stored = null;
        await render(tableField("tbl_orders", (next) => (stored = next)));
        assert.match(container.textContent, /Orders/);
        await open("n-tableId");
        assert.deepEqual(optionLabels(), ["Customers", "Orders"]);
        await pick("Customers");
        assert.equal(stored, "tbl_customers");
        await unmount();

        // A table the account no longer has stays selected and reads as invalid.
        await render(tableField("tbl_gone"));
        assert.equal(control("n-tableId").getAttribute("aria-invalid"), "true");
        assert.match(container.textContent, /tbl_gone/);
        assert.match(container.textContent, /not one of your tables any more/);
        await unmount();

        // With no tables the picker is disabled and points at the section that makes one.
        state = { ...state, tables: [] };
        await render(tableField(""));
        assert.ok(disabled("n-tableId"));
        assert.equal(container.querySelector("a[href='/data']").textContent, "Create a table first");
        await unmount();

        // A column picker with no table selected explains itself instead of offering nothing.
        state = { ...state, tables: [customers] };
        let patch = null;
        const settings = (tableId) =>
          createElement(ObjectFields, {
            id: "n",
            properties: findRecordsConfigSchema.properties,
            value: {
              tableId,
              filters: [{ column: "", operator: "equals", value: "" }],
              sortColumn: "",
              sortDirection: "desc",
              limit: 25,
            },
            onChange: (next) => (patch = next),
          });
        await render(settings(""));
        assert.ok(disabled("n-filters-0-column"));
        assert.match(container.textContent, /Pick a table for this node first/);
        await unmount();

        // Once the node names a table, a filter row lists that table's columns and stores the id.
        await render(settings("tbl_customers"));
        assert.ok(!disabled("n-filters-0-column"));
        await open("n-filters-0-column");
        assert.deepEqual(optionLabels(), ["Email", "Plan"]);
        await pick("Plan");
        assert.deepEqual(patch, { filters: [{ column: "plan", operator: "equals", value: "" }] });
        await unmount();
      `,
    ],
    {
      cwd: fileURLToPath(new URL(".", import.meta.url)),
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  expect(stderr).toBe("");
  expect(code).toBe(0);
});

/* Same child-process shape: the operator list narrows to what the row's column type supports. */
test("a filter row only offers the operators its column type supports", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "-e",
      `
        import assert from "node:assert/strict";
        import { GlobalRegistrator } from "@happy-dom/global-registrator";
        import { mock } from "bun:test";
        import { act, createElement } from "react";
        import { createRoot } from "react-dom/client";

        GlobalRegistrator.register();
        Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

        const column = (id, name, type) => ({ id, name, type, required: false });
        const customers = {
          id: "tbl_customers",
          name: "Customers",
          columns: [
            column("email", "Email", "text"),
            column("paid", "Paid", "checkbox"),
            column("spend", "Spend", "number"),
          ],
          recordCount: 0,
          createdAt: "2026-09-08T00:00:00.000Z",
          updatedAt: "2026-09-08T00:00:00.000Z",
        };

        const state = { tables: [customers], loading: false, error: null, refresh: async () => {} };
        mock.module("../../data/tables-context", () => ({ useDataTables: () => state }));

        const { conditionOperators, findRecordsConfigSchema } = await import("@automator/contracts");
        const { ObjectFields } = await import("./fields");

        let container;
        let root;
        const render = async (element) => {
          container = window.document.createElement("div");
          window.document.body.append(container);
          root = createRoot(container);
          await act(async () => root.render(element));
        };
        const unmount = async () => {
          await act(async () => root.unmount());
          container.remove();
        };
        const control = (id) => container.querySelector("#" + id);
        const operators = async () => {
          await act(async () => control("n-filters-0-operator").click());
          return [...window.document.querySelectorAll("[data-slot=select-item]")].map(
            (node) => node.textContent,
          );
        };

        let patch = null;
        const settings = (tableId, filter) =>
          createElement(ObjectFields, {
            id: "n",
            properties: findRecordsConfigSchema.properties,
            value: {
              tableId,
              filters: [filter],
              sortColumn: "",
              sortDirection: "desc",
              limit: 25,
            },
            onChange: (next) => (patch = next),
          });

        // A checkbox cannot be searched for a substring or compared, so those are not offered.
        await render(settings("tbl_customers", { column: "paid", operator: "equals", value: "" }));
        assert.deepEqual(await operators(), ["Equals", "Not equals", "Is empty", "Is not empty"]);
        assert.equal(control("n-filters-0-operator").getAttribute("aria-invalid"), null);
        await unmount();

        // Text takes "contains"; a number takes the comparisons instead.
        await render(settings("tbl_customers", { column: "email", operator: "equals", value: "" }));
        assert.deepEqual(await operators(), [
          "Equals",
          "Not equals",
          "Contains",
          "Is empty",
          "Is not empty",
        ]);
        await unmount();
        await render(settings("tbl_customers", { column: "spend", operator: "equals", value: "" }));
        assert.deepEqual(await operators(), [
          "Equals",
          "Not equals",
          "Greater than",
          "Less than",
          "Is empty",
          "Is not empty",
        ]);
        await unmount();

        // With no column picked there is nothing to narrow by, so the whole list stays offered.
        await render(settings("tbl_customers", { column: "", operator: "equals", value: "" }));
        assert.equal((await operators()).length, conditionOperators.length);
        await unmount();
        await render(settings("", { column: "paid", operator: "contains", value: "" }));
        assert.equal((await operators()).length, conditionOperators.length);
        await unmount();

        // A stored operator the column cannot take stays selected, and says why it cannot be used.
        await render(settings("tbl_customers", { column: "paid", operator: "contains", value: "" }));
        assert.equal(control("n-filters-0-operator").getAttribute("aria-invalid"), "true");
        assert.match(container.textContent, /Contains/);
        assert.match(container.textContent, /“Paid” cannot be filtered with “Contains”/);
        assert.deepEqual(await operators(), [
          "Equals",
          "Not equals",
          "Is empty",
          "Is not empty",
          "Contains",
        ]);
        assert.equal(patch, null);
        await unmount();
      `,
    ],
    {
      cwd: fileURLToPath(new URL(".", import.meta.url)),
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  expect(stderr).toBe("");
  expect(code).toBe(0);
});
