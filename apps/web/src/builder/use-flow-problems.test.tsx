/// <reference types="bun" />
import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

/*
 * The hook reads `useDataTables`; mocking it in a child process keeps that out of Bun's shared
 * module registry, the way `canvas-header.test.tsx` does.
 */
test("the canvas problems check data nodes against the account's tables", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "-e",
      `
        import assert from "node:assert/strict";
        import { mock } from "bun:test";
        import { createElement } from "react";
        import { renderToStaticMarkup } from "react-dom/server";

        let state = { tables: [], loading: true, error: null, refresh: async () => {} };
        mock.module("../data/tables-context", () => ({ useDataTables: () => state }));

        const { BuilderStoreProvider } = await import("./store-provider");
        const { useFlowProblems } = await import("./use-flow-problems");

        const document = {
          version: 1,
          id: "f",
          name: "Signup",
          description: "",
          nodes: [
            { id: "t", type: "trigger.webhook", position: { x: 0, y: 0 }, label: "Hook", config: {} },
            {
              id: "find",
              type: "data.find-records",
              position: { x: 0, y: 0 },
              label: "Find",
              config: {
                tableId: "tbl_customers",
                filters: [{ column: "nope", operator: "equals", value: "x" }],
              },
            },
          ],
          edges: [{ id: "1", source: "t", target: "find", targetHandle: "query" }],
        };
        const Probe = () => createElement("output", null, useFlowProblems().map((p) => p.message).join(" | "));
        const problems = () =>
          renderToStaticMarkup(
            createElement(BuilderStoreProvider, { document }, createElement(Probe)),
          );

        // While the list loads nothing is known to be missing, so no badge is raised.
        assert.doesNotMatch(problems(), /tbl_customers/);

        // A settled list without the table names it, and so does the canvas badge.
        state = { ...state, loading: false };
        assert.match(problems(), /config.tableId: Table &quot;tbl_customers&quot; is not one of your tables any more/);

        // With the table present, only the unknown column is reported.
        state = {
          ...state,
          tables: [{ id: "tbl_customers", name: "Customers", columns: [{ id: "email" }] }],
        };
        const withTable = problems();
        assert.doesNotMatch(withTable, /is not one of your tables/);
        assert.match(withTable, /config.filters.0.column: &quot;nope&quot; is not a column of &quot;Customers&quot;/);

        // A failed load must not accuse the flow of pointing at a table that is gone.
        state = { ...state, tables: [], error: "Your tables could not be loaded." };
        assert.doesNotMatch(problems(), /tbl_customers/);
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
