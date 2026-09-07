import { flowDocumentSchema, Value } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { createEmptyFlow, serializeFlow } from "./document";
import { createBuilderStore } from "./store";

function setup() {
  return createBuilderStore(createEmptyFlow("flow-1"));
}

describe("builder store", () => {
  test("starts clean with the document's meta", () => {
    const store = setup();
    expect(store.getState().meta).toEqual({ id: "flow-1", name: "Untitled flow", description: "" });
    expect(store.getState().nodes).toEqual([]);
    expect(store.getState().dirty).toBe(false);
  });

  test("addNode appends a flow node with the catalog label and marks the store dirty", () => {
    const store = setup();
    const id = store.getState().addNode("trigger.webhook", { x: 10, y: 20 });
    const node = store.getState().nodes.find((item) => item.id === id);
    expect(node).toEqual({
      id,
      type: "flow",
      position: { x: 10, y: 20 },
      data: { type: "trigger.webhook", label: "Webhook", config: {} },
      selected: true,
    });
    expect(store.getState().dirty).toBe(true);
  });

  test("addNode selects the new node and deselects the others", () => {
    const store = setup();
    const first = store.getState().addNode("trigger.webhook", { x: 0, y: 0 });
    const second = store.getState().addNode("screen.page", { x: 0, y: 0 });
    const selected = store
      .getState()
      .nodes.filter((node) => node.selected)
      .map((node) => node.id);
    expect(selected).toEqual([second]);
    expect(first).not.toBe(second);
  });

  test("onConnect adds one edge and rejects self-loops and duplicates", () => {
    const store = setup();
    const a = store.getState().addNode("trigger.webhook", { x: 0, y: 0 });
    const b = store.getState().addNode("ai.agent", { x: 300, y: 0 });
    const connection = { source: a, target: b, sourceHandle: null, targetHandle: null };

    store.getState().onConnect(connection);
    store.getState().onConnect(connection);
    store.getState().onConnect({ ...connection, target: a });

    expect(store.getState().edges).toHaveLength(1);
    expect(store.getState().edges[0]).toMatchObject({ source: a, target: b });
    expect(store.getState().canConnect(connection)).toBe(false);
    // Reversing the pair would close a cycle (a -> b -> a), so it is rejected too.
    expect(store.getState().canConnect({ ...connection, source: b, target: a })).toBe(false);
  });

  test("the same pair on another target handle connects, an exact duplicate does not", () => {
    const store = setup();
    const a = store.getState().addNode("trigger.miniapp-open", { x: 0, y: 0 });
    const b = store.getState().addNode("integration.usdc-payment", { x: 300, y: 0 });
    const connection = {
      source: a,
      target: b,
      sourceHandle: "visitor",
      targetHandle: "amount",
    };

    store.getState().onConnect(connection);
    expect(store.getState().canConnect(connection)).toBe(false);
    expect(store.getState().canConnect({ ...connection, targetHandle: "payer" })).toBe(true);

    store.getState().onConnect({ ...connection, targetHandle: "payer" });
    expect(store.getState().edges).toHaveLength(2);
    expect(store.getState().edges.map((edge) => edge.targetHandle)).toEqual(["amount", "payer"]);
  });

  test("an input accepts only one source", () => {
    const store = setup();
    const a = store.getState().addNode("trigger.miniapp-open", { x: 0, y: 0 });
    const b = store.getState().addNode("screen.page", { x: 0, y: 100 });
    const c = store.getState().addNode("integration.usdc-payment", { x: 300, y: 0 });

    store
      .getState()
      .onConnect({ source: a, target: c, sourceHandle: "visitor", targetHandle: "amount" });
    expect(store.getState().edges).toHaveLength(1);

    const blocked = { source: b, target: c, sourceHandle: "next", targetHandle: "amount" };
    expect(store.getState().canConnect(blocked)).toBe(false);
    store.getState().onConnect(blocked);
    expect(store.getState().edges).toHaveLength(1);

    const allowed = { source: b, target: c, sourceHandle: "next", targetHandle: "payer" };
    expect(store.getState().canConnect(allowed)).toBe(true);
    store.getState().onConnect(allowed);
    expect(store.getState().edges).toHaveLength(2);
  });

  test("an output can fan out to several targets", () => {
    const store = setup();
    const a = store.getState().addNode("trigger.miniapp-open", { x: 0, y: 0 });
    const b = store.getState().addNode("screen.page", { x: 300, y: 0 });
    const c = store.getState().addNode("integration.usdc-payment", { x: 300, y: 200 });

    const toB = { source: a, target: b, sourceHandle: "visitor", targetHandle: "data" };
    const toC = { source: a, target: c, sourceHandle: "visitor", targetHandle: "amount" };
    expect(store.getState().canConnect(toB)).toBe(true);
    store.getState().onConnect(toB);
    expect(store.getState().canConnect(toC)).toBe(true);
    store.getState().onConnect(toC);

    expect(store.getState().edges).toHaveLength(2);
  });

  test("a direct cycle is rejected", () => {
    const store = setup();
    const a = store.getState().addNode("screen.page", { x: 0, y: 0 });
    const b = store.getState().addNode("screen.page", { x: 300, y: 0 });

    const forward = { source: a, target: b, sourceHandle: "next", targetHandle: "data" };
    expect(store.getState().canConnect(forward)).toBe(true);
    store.getState().onConnect(forward);
    expect(store.getState().edges).toHaveLength(1);

    const backward = { source: b, target: a, sourceHandle: "next", targetHandle: "data" };
    expect(store.getState().canConnect(backward)).toBe(false);
    store.getState().onConnect(backward);
    expect(store.getState().edges).toHaveLength(1);
  });

  test("a longer cycle is rejected", () => {
    const store = setup();
    const a = store.getState().addNode("screen.page", { x: 0, y: 0 });
    const b = store.getState().addNode("screen.page", { x: 300, y: 0 });
    const c = store.getState().addNode("screen.page", { x: 600, y: 0 });
    const d = store.getState().addNode("screen.page", { x: 900, y: 0 });

    store
      .getState()
      .onConnect({ source: a, target: b, sourceHandle: "next", targetHandle: "data" });
    store
      .getState()
      .onConnect({ source: b, target: c, sourceHandle: "next", targetHandle: "data" });
    expect(store.getState().edges).toHaveLength(2);

    const closing = { source: c, target: a, sourceHandle: "next", targetHandle: "data" };
    expect(store.getState().canConnect(closing)).toBe(false);
    store.getState().onConnect(closing);
    expect(store.getState().edges).toHaveLength(2);

    const toNew = { source: c, target: d, sourceHandle: "next", targetHandle: "data" };
    expect(store.getState().canConnect(toNew)).toBe(true);
    store.getState().onConnect(toNew);
    expect(store.getState().edges).toHaveLength(3);
  });

  test("renameNode updates only the label", () => {
    const store = setup();
    const id = store.getState().addNode("screen.page", { x: 0, y: 0 });
    store.getState().renameNode(id, "Welcome");
    expect(store.getState().nodes[0]?.data).toEqual({
      type: "screen.page",
      label: "Welcome",
      config: {},
    });
  });

  test("removeNode drops the node and its edges", () => {
    const store = setup();
    const a = store.getState().addNode("trigger.webhook", { x: 0, y: 0 });
    const b = store.getState().addNode("ai.agent", { x: 300, y: 0 });
    store.getState().onConnect({ source: a, target: b, sourceHandle: null, targetHandle: null });
    store.getState().removeNode(b);
    expect(store.getState().nodes.map((node) => node.id)).toEqual([a]);
    expect(store.getState().edges).toEqual([]);
  });

  test("selection changes do not mark the store dirty, position changes do", () => {
    const store = setup();
    const id = store.getState().addNode("screen.page", { x: 0, y: 0 });
    store
      .getState()
      .hydrate(
        serializeFlow(store.getState().meta, store.getState().nodes, store.getState().edges),
      );
    expect(store.getState().dirty).toBe(false);

    store.getState().onNodesChange([{ type: "select", id, selected: true }]);
    expect(store.getState().dirty).toBe(false);

    store.getState().onNodesChange([{ type: "position", id, position: { x: 5, y: 5 } }]);
    expect(store.getState().dirty).toBe(true);
    expect(store.getState().nodes[0]?.position).toEqual({ x: 5, y: 5 });
  });

  test("clearSelection deselects nodes and edges without marking the store dirty", () => {
    const store = setup();
    const a = store.getState().addNode("trigger.webhook", { x: 0, y: 0 });
    const b = store.getState().addNode("ai.agent", { x: 300, y: 0 });
    store.getState().onConnect({ source: a, target: b, sourceHandle: null, targetHandle: null });
    store
      .getState()
      .hydrate(
        serializeFlow(store.getState().meta, store.getState().nodes, store.getState().edges),
      );
    const edgeId = store.getState().edges[0]?.id as string;
    store.getState().onNodesChange([
      { type: "select", id: a, selected: true },
      { type: "select", id: b, selected: true },
    ]);
    store.getState().onEdgesChange([{ type: "select", id: edgeId, selected: true }]);
    expect(store.getState().nodes.filter((node) => node.selected)).toHaveLength(2);
    expect(store.getState().edges.filter((edge) => edge.selected)).toHaveLength(1);
    expect(store.getState().dirty).toBe(false);

    store.getState().clearSelection();

    expect(store.getState().nodes.every((node) => !node.selected)).toBe(true);
    expect(store.getState().edges.every((edge) => !edge.selected)).toBe(true);
    expect(store.getState().nodes.map((node) => node.id)).toEqual([a, b]);
    expect(store.getState().dirty).toBe(false);
  });

  test("setMeta patches name and description", () => {
    const store = setup();
    store.getState().setMeta({ name: "Checkout" });
    expect(store.getState().meta).toEqual({ id: "flow-1", name: "Checkout", description: "" });
    expect(store.getState().dirty).toBe(true);
  });

  test("hydrate replaces the graph and clears dirty", () => {
    const store = setup();
    store.getState().addNode("screen.page", { x: 0, y: 0 });
    store.getState().hydrate({
      ...createEmptyFlow("flow-2"),
      name: "Other",
      nodes: [{ id: "x", type: "ai.agent", position: { x: 1, y: 2 }, label: "Agent", config: {} }],
    });
    expect(store.getState().meta.id).toBe("flow-2");
    expect(store.getState().nodes.map((node) => node.id)).toEqual(["x"]);
    expect(store.getState().dirty).toBe(false);
  });

  test("the serialized store is a valid document", () => {
    const store = setup();
    const a = store.getState().addNode("trigger.miniapp-open", { x: 0, y: 0 });
    const b = store.getState().addNode("integration.privy-wallet", { x: 300, y: 0 });
    store.getState().onConnect({ source: a, target: b, sourceHandle: null, targetHandle: null });
    const state = store.getState();
    expect(
      Value.Check(flowDocumentSchema, serializeFlow(state.meta, state.nodes, state.edges)),
    ).toBe(true);
  });
});
