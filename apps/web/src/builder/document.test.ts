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
      type: "usdc.payment",
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
        data: { type: "usdc.payment", label: "Pay", config: {} },
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

  test("keeps the chain id in the meta and leaves it out when the document has none", () => {
    const onWorld = { ...document, chainId: 4801 as const };
    const { meta, nodes, edges } = hydrateFlow(onWorld);
    expect(meta.chainId).toBe(4801);
    expect(serializeFlow(meta, nodes, edges)).toEqual(onWorld);
    expect("chainId" in serializeFlow(hydrateFlow(document).meta, nodes, edges)).toBe(false);
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

describe("groups", () => {
  const grouped: FlowDocument = {
    ...document,
    groups: [{ id: "g1", label: "Checkout", position: { x: 200, y: 20 }, width: 400, height: 200 }],
    nodes: [document.nodes[0]!, { ...document.nodes[1]!, parentId: "g1" }],
  };

  test("hydrate puts the frame first and makes its children relative to it", () => {
    const { nodes } = hydrateFlow(grouped);
    expect(nodes[0]).toEqual({
      id: "g1",
      type: "group",
      position: { x: 200, y: 20 },
      width: 400,
      height: 200,
      data: { label: "Checkout" },
    });
    expect(nodes[2]).toMatchObject({ id: "n2", parentId: "g1", position: { x: 100, y: 20 } });
    expect(nodes[1]).not.toHaveProperty("parentId");
  });

  test("serialize restores absolute positions and writes the groups back", () => {
    const { meta, nodes, edges } = hydrateFlow(grouped);
    expect(serializeFlow(meta, nodes, edges)).toEqual(grouped);
  });

  test("a document without groups serialises without a groups key", () => {
    const { meta, nodes, edges } = hydrateFlow(document);
    expect(serializeFlow(meta, nodes, edges)).not.toHaveProperty("groups");
  });

  test("a node whose group is missing keeps its place and loses the parent", () => {
    const { nodes } = hydrateFlow({ ...grouped, groups: [] });
    expect(nodes).toHaveLength(2);
    expect(nodes[1]).toMatchObject({ id: "n2", position: { x: 300, y: 40 } });
    expect(nodes[1]).not.toHaveProperty("parentId");
  });

  test("a resized frame serialises its new size", () => {
    const { meta, nodes, edges } = hydrateFlow(grouped);
    const resized = nodes.map((node) =>
      node.id === "g1" ? { ...node, width: 520, height: 300 } : node,
    );
    expect(serializeFlow(meta, resized, edges).groups).toEqual([
      { id: "g1", label: "Checkout", position: { x: 200, y: 20 }, width: 520, height: 300 },
    ]);
  });
});
