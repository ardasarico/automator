import { flowDocumentSchema, Value, type FlowDocument } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { createEmptyFlow, hydrateFlow, serializeFlow, type BuilderNode } from "./document";

const document: FlowDocument = {
  version: 1,
  id: "flow-1",
  name: "Payment link",
  description: "Accept USDC payments.",
  nodes: [
    {
      id: "n1",
      type: "trigger.miniapp-open",
      position: { x: 0, y: 0 },
      label: "Opened",
      config: {},
    },
    {
      id: "n2",
      type: "integration.usdc-payment",
      position: { x: 300, y: 40 },
      label: "Pay",
      config: {},
    },
  ],
  edges: [
    { id: "e1", source: "n1", target: "n2" },
    { id: "e2", source: "n1", target: "n2", sourceHandle: "out", targetHandle: "in" },
  ],
};

describe("createEmptyFlow", () => {
  test("returns a valid, empty document", () => {
    const empty = createEmptyFlow("abc");
    expect(empty).toEqual({
      version: 1,
      id: "abc",
      name: "Untitled flow",
      description: "",
      nodes: [],
      edges: [],
    });
    expect(Value.Check(flowDocumentSchema, empty)).toBe(true);
  });
});

describe("hydrateFlow", () => {
  test("maps document nodes to canvas nodes of type flow", () => {
    const { meta, nodes, edges } = hydrateFlow(document);
    expect(meta).toEqual({
      id: "flow-1",
      name: "Payment link",
      description: "Accept USDC payments.",
    });
    expect(nodes).toEqual([
      {
        id: "n1",
        type: "flow",
        position: { x: 0, y: 0 },
        data: { type: "trigger.miniapp-open", label: "Opened", config: {} },
      },
      {
        id: "n2",
        type: "flow",
        position: { x: 300, y: 40 },
        data: { type: "integration.usdc-payment", label: "Pay", config: {} },
      },
    ]);
    expect(edges).toEqual([
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n1", target: "n2", sourceHandle: "out", targetHandle: "in" },
    ]);
  });
});

describe("serializeFlow", () => {
  test("round-trips a document unchanged", () => {
    const { meta, nodes, edges } = hydrateFlow(document);
    expect(serializeFlow(meta, nodes, edges)).toEqual(document);
  });

  test("drops canvas-only fields and null handles", () => {
    const { meta, nodes, edges } = hydrateFlow(document);
    const decorated: BuilderNode[] = nodes.map((node) => ({
      ...node,
      selected: true,
      dragging: true,
      measured: { width: 240, height: 64 },
    }));
    const nullHandles = edges.map((edge) => ({
      ...edge,
      selected: true,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
    }));
    const serialized = serializeFlow(meta, decorated, nullHandles);
    expect(serialized).toEqual(document);
    expect(Value.Check(flowDocumentSchema, serialized)).toBe(true);
  });
});
