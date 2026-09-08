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
