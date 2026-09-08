import { describe, expect, test } from "bun:test";
import { findFlowConfigProblems } from "./flow-config-problems";
import type { FlowEdge, FlowNode } from "./flows";

const form: FlowNode = {
  id: "form",
  type: "screen.form",
  label: "Details",
  position: { x: 0, y: 0 },
  config: { fields: [{ id: "email", type: "email" }] },
};
const message: FlowNode = {
  id: "message",
  type: "notify.discord",
  label: "Notify",
  position: { x: 0, y: 0 },
  config: {},
};
const edge: FlowEdge = {
  id: "e1",
  source: form.id,
  sourceHandle: "submitted",
  target: message.id,
};

function problems(reference: string, edges: FlowEdge[] = []) {
  return findFlowConfigProblems({
    nodes: [form, { ...message, config: { message: reference } }],
    edges,
  });
}

describe("flow config template validation", () => {
  test("accepts the whole input scope with or without an incoming edge", () => {
    expect(problems("{{input}}")).toEqual([]);
    expect(problems("Input: {{ input }}", [edge])).toEqual([]);
  });

  test("resolves handleless edges under the engine's input fallback", () => {
    expect(problems("{{input.input.email}}", [edge])).toEqual([]);
    expect(problems("{{input.input}}", [edge])).toEqual([]);
    expect(problems("{{input.input.email}}")).toHaveLength(1);
  });

  test("continues rejecting nonexistent explicit ports despite a handleless connection", () => {
    expect(problems("{{input.unknown}}", [edge])).toHaveLength(1);
    expect(problems("{{input.unknown}}", [{ ...edge, targetHandle: "unknown" }])).toHaveLength(1);
  });

  test("a handleless edge does not supply a different declared input port", () => {
    expect(problems("{{input.message}}", [edge])[0]?.message).toContain("no incoming connection");
    expect(problems("{{input.message.email}}", [{ ...edge, targetHandle: "message" }])).toEqual([]);
  });

  test("checks form field references through both explicit and fallback inputs", () => {
    expect(problems("{{input.input.missing}}", [edge])[0]?.message).toContain("unknown form field");
    expect(
      problems("{{input.message.missing}}", [{ ...edge, targetHandle: "message" }])[0]?.message,
    ).toContain("unknown form field");
  });
});

describe("form field identifiers", () => {
  test("rejects the prototype setter key that ordinary record assignments discard", () => {
    const result = findFlowConfigProblems({
      nodes: [{ ...form, config: { fields: [{ id: "__proto__", required: true }] } }],
      edges: [],
    });
    expect(result).toEqual([
      {
        nodeId: "form",
        path: "config.fields.0.id",
        message: 'Form field id "__proto__" is reserved.',
      },
    ]);
  });
});

const tables = [
  { id: "t1", name: "Signups", columns: [{ id: "c_email" }, { id: "c_name" }] },
] as const;

function dataNode(config: Record<string, unknown>): FlowNode {
  return {
    id: "data",
    type: "data.find-records",
    label: "Find records",
    position: { x: 0, y: 0 },
    config,
  };
}

function dataProblems(config: Record<string, unknown>, withTables = true) {
  return findFlowConfigProblems(
    { nodes: [dataNode(config)], edges: [] },
    withTables ? tables : undefined,
  );
}

describe("data node table references", () => {
  test("asks for a table when none is selected, with or without a table list", () => {
    const message = "Pick a table for this node.";
    expect(dataProblems({ tableId: "" })).toEqual([
      { nodeId: "data", path: "config.tableId", message },
    ]);
    expect(dataProblems({}, false)).toEqual([{ nodeId: "data", path: "config.tableId", message }]);
  });

  test("names a table the owner no longer has", () => {
    expect(dataProblems({ tableId: "gone" })).toEqual([
      {
        nodeId: "data",
        path: "config.tableId",
        message: 'Table "gone" is not one of your tables any more.',
      },
    ]);
  });

  test("reports filter, value and sort columns the table does not have", () => {
    const problems = dataProblems({
      tableId: "t1",
      filters: [
        { column: "c_email", operator: "equals", value: "a" },
        { column: "c_gone", operator: "equals", value: "b" },
        { column: "", operator: "equals", value: "c" },
      ],
      values: [{ column: "c_dropped", value: "x" }],
      sortColumn: "c_missing",
    });
    expect(problems.map((problem) => problem.path)).toEqual([
      "config.filters.1.column",
      "config.values.0.column",
      "config.sortColumn",
    ]);
    expect(problems[0]?.message).toBe('"c_gone" is not a column of "Signups".');
  });

  test("accepts a fully resolved data node", () => {
    expect(
      dataProblems({
        tableId: "t1",
        filters: [{ column: "c_email", operator: "equals", value: "a" }],
        sortColumn: "c_name",
      }),
    ).toEqual([]);
  });

  test("leaves column references unchecked when the caller passes no tables", () => {
    expect(dataProblems({ tableId: "gone", sortColumn: "c_missing" }, false)).toEqual([]);
  });
});
