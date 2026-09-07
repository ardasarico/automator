import { Value } from "@sinclair/typebox/value";
import { describe, expect, test } from "bun:test";
import { flowDocumentSchema, flowNodeTypes, type FlowDocument } from "./flows";

const document: FlowDocument = {
  version: 1,
  id: "flow-1",
  name: "Ticket checkout",
  description: "Verify a visitor, collect payment and issue a ticket.",
  nodes: [
    {
      id: "n1",
      type: "trigger.miniapp-open",
      position: { x: 0, y: 0 },
      label: "Mini-app opened",
      config: {},
    },
    {
      id: "n2",
      type: "privy.wallet",
      position: { x: 300, y: 0 },
      label: "Collect payment",
      config: { note: "dummy" },
    },
  ],
  edges: [{ id: "e1", source: "n1", target: "n2" }],
};

describe("flow document schema", () => {
  test("accepts a representative document", () => {
    expect(Value.Check(flowDocumentSchema, document)).toBe(true);
  });

  test("accepts edges with handle ids", () => {
    const withHandles = {
      ...document,
      edges: [{ id: "e1", source: "n1", target: "n2", sourceHandle: "out", targetHandle: "in" }],
    };
    expect(Value.Check(flowDocumentSchema, withHandles)).toBe(true);
  });

  test("lists 37 node types with no duplicates", () => {
    expect(flowNodeTypes).toHaveLength(37);
    expect(new Set(flowNodeTypes).size).toBe(flowNodeTypes.length);
  });

  test.each([
    [
      "unknown node type",
      { ...document, nodes: [{ ...document.nodes[0], type: "logic.nonexistent" }] },
    ],
    ["wrong version", { ...document, version: 2 }],
    ["missing config", { ...document, nodes: [{ ...document.nodes[0], config: undefined }] }],
    ["empty node id", { ...document, nodes: [{ ...document.nodes[0], id: "" }] }],
    ["edge without target", { ...document, edges: [{ id: "e1", source: "n1" }] }],
    [
      "non-numeric position",
      { ...document, nodes: [{ ...document.nodes[0], position: { x: "0", y: 0 } }] },
    ],
  ])("rejects %s", (_name, invalid) => {
    expect(Value.Check(flowDocumentSchema, invalid)).toBe(false);
  });
});
