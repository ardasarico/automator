import { flowDocumentSchema, Value, type FlowDocument } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { createEmptyFlow, isFlowNode, serializeFlow, type BuilderNode } from "./document";

/** The data of a flow node; a frame here is a test that went wrong. */
function dataOf(node: BuilderNode | undefined) {
  if (!node || !isFlowNode(node)) throw new Error("expected a flow node");
  return node.data;
}
import {
  createBuilderStore,
  historyLimit,
  selectCanRedo,
  selectCanUndo,
  selectSelectedNodes,
} from "./store";

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

  test("addNode wires the new node to the source port in one history entry", () => {
    const store = setup();
    const trigger = store.getState().addNode("trigger.webhook", { x: 0, y: 0 });
    const added = store
      .getState()
      .addNode("ai.agent", { x: 300, y: 0 }, { source: trigger, sourceHandle: "request" });

    expect(store.getState().edges).toEqual([
      expect.objectContaining({
        source: trigger,
        sourceHandle: "request",
        target: added,
        targetHandle: "prompt",
      }),
    ]);

    store.getState().undo();
    expect(store.getState().nodes.map((node) => node.id)).toEqual([trigger]);
    expect(store.getState().edges).toEqual([]);
  });

  test("addNode leaves a rejected connection out and still adds the node", () => {
    const store = setup();
    const added = store
      .getState()
      .addNode("ai.agent", { x: 0, y: 0 }, { source: "missing-node", sourceHandle: "out" });
    expect(store.getState().nodes.map((node) => node.id)).toEqual([added]);
    expect(store.getState().edges).toEqual([]);
  });

  test("insertNode copies a saved node's settings without sharing them", () => {
    const store = setup();
    const config = { content: "Hello", fields: [{ id: "email" }] };
    const id = store
      .getState()
      .insertNode({ type: "notify.discord", label: "Announce", config }, { x: 0, y: 0 });
    config.content = "Changed";
    const node = store.getState().nodes.find((item) => item.id === id)!;
    expect(node.data).toEqual({
      type: "notify.discord",
      label: "Announce",
      config: { content: "Hello", fields: [{ id: "email" }] },
    });
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
    expect(store.getState().canConnect({ ...connection, source: b, target: a })).toBe(false);
  });

  test("adding a node deselects existing edges so Delete only removes the new selection", () => {
    const store = setup();
    const a = store.getState().addNode("trigger.manual", { x: 0, y: 0 });
    const b = store.getState().addNode("screen.page", { x: 300, y: 0 });
    store.getState().onConnect({ source: a, target: b, sourceHandle: null, targetHandle: null });
    const edge = store.getState().edges[0]!;
    store.getState().onEdgesChange([{ type: "select", id: edge.id, selected: true }]);

    const added = store.getState().addNode("screen.page", { x: 600, y: 0 });
    expect(
      store
        .getState()
        .nodes.filter((node) => node.selected)
        .map((node) => node.id),
    ).toEqual([added]);
    expect(store.getState().edges.filter((item) => item.selected)).toEqual([]);
    store.getState().removeNode(added);
    expect(store.getState().edges).toHaveLength(1);
  });

  test("the same pair on another target handle connects, an exact duplicate does not", () => {
    const store = setup();
    const a = store.getState().addNode("trigger.miniapp-open", { x: 0, y: 0 });
    const b = store.getState().addNode("usdc.payment", { x: 300, y: 0 });
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
    const c = store.getState().addNode("usdc.payment", { x: 300, y: 0 });

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
    const c = store.getState().addNode("usdc.payment", { x: 300, y: 200 });

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
    const b = store.getState().addNode("privy.wallet", { x: 300, y: 0 });
    store.getState().onConnect({ source: a, target: b, sourceHandle: null, targetHandle: null });
    const state = store.getState();
    expect(
      Value.Check(flowDocumentSchema, serializeFlow(state.meta, state.nodes, state.edges)),
    ).toBe(true);
  });

  test("markSaved clears dirty without touching the graph", () => {
    const store = setup();
    const id = store.getState().addNode("trigger.webhook", { x: 1, y: 2 });
    expect(store.getState().dirty).toBe(true);
    store.getState().markSaved();
    expect(store.getState().dirty).toBe(false);
    expect(store.getState().nodes.map((node) => node.id)).toEqual([id]);
    store.getState().renameNode(id, "Hook");
    expect(store.getState().dirty).toBe(true);
  });

  test("a save ignores selection changes and closes the previous typing undo group", () => {
    const store = setup();
    const id = store.getState().addNode("trigger.webhook", { x: 1, y: 2 });
    store.getState().renameNode(id, "Saved label");
    const before = store.getState();
    const saved = serializeFlow(before.meta, before.nodes, before.edges);
    store.getState().clearSelection();
    expect(store.getState().markSaved(saved)).toBe(true);
    store.getState().renameNode(id, "Next label");
    store.getState().undo();
    expect(store.getState().nodes[0]!.data.label).toBe("Saved label");
  });
});

describe("node config", () => {
  test("setNodeConfig merges one field at a time and marks the store dirty", () => {
    const store = setup();
    const id = store.getState().addNode("notify.discord", { x: 0, y: 0 });
    store.getState().markSaved();
    store.getState().setNodeConfig(id, { content: "hi" });
    store.getState().setNodeConfig(id, { username: "Bot" });
    const node = store.getState().nodes.find((item) => item.id === id);
    expect(dataOf(node).config).toEqual({ content: "hi", username: "Bot" });
    expect(store.getState().dirty).toBe(true);
  });
});

describe("applyDocument", () => {
  test("replaces the graph and meta, keeps the flow id, and marks the store dirty", () => {
    const store = setup();
    store.getState().addNode("trigger.manual", { x: 0, y: 0 });
    store.getState().markSaved();
    store.getState().applyDocument({
      version: 1,
      name: "Generated",
      description: "From a prompt",
      nodes: [
        {
          id: "a",
          type: "trigger.webhook",
          position: { x: 80, y: 120 },
          label: "Hook",
          config: {},
        },
        {
          id: "b",
          type: "notify.discord",
          position: { x: 380, y: 120 },
          label: "Post",
          config: { content: "x" },
        },
      ],
      edges: [
        { id: "e", source: "a", sourceHandle: "request", target: "b", targetHandle: "message" },
      ],
    });
    const state = store.getState();
    expect(state.meta).toEqual({ id: "flow-1", name: "Generated", description: "From a prompt" });
    expect(state.nodes.map((node) => [node.id, dataOf(node).type])).toEqual([
      ["a", "trigger.webhook"],
      ["b", "notify.discord"],
    ]);
    expect(state.edges).toHaveLength(1);
    expect(state.dirty).toBe(true);
  });
});

describe("history", () => {
  test("undo and redo walk through node additions and edge connections", () => {
    const store = setup();
    const a = store.getState().addNode("trigger.webhook", { x: 0, y: 0 });
    const b = store.getState().addNode("screen.page", { x: 300, y: 0 });
    store.getState().onConnect({ source: a, target: b, sourceHandle: null, targetHandle: null });
    expect(store.getState().edges).toHaveLength(1);

    store.getState().undo();
    expect(store.getState().edges).toHaveLength(0);
    expect(store.getState().nodes).toHaveLength(2);
    store.getState().undo();
    store.getState().undo();
    expect(store.getState().nodes).toHaveLength(0);
    store.getState().undo();
    expect(store.getState().past).toEqual([]);

    store.getState().redo();
    store.getState().redo();
    store.getState().redo();
    expect(store.getState().nodes.map((node) => node.id)).toEqual([a, b]);
    expect(store.getState().edges).toHaveLength(1);
    expect(store.getState().future).toEqual([]);
  });

  test("a new edit after undo discards the redo stack", () => {
    const store = setup();
    store.getState().addNode("trigger.webhook", { x: 0, y: 0 });
    store.getState().undo();
    store.getState().addNode("screen.page", { x: 0, y: 0 });
    expect(store.getState().future).toEqual([]);
    expect(dataOf(store.getState().nodes[0]).type).toBe("screen.page");
  });

  test("typing into one field coalesces into a single undo step", () => {
    const store = setup();
    const id = store.getState().addNode("screen.page", { x: 0, y: 0 });
    store.getState().renameNode(id, "W");
    store.getState().renameNode(id, "We");
    store.getState().renameNode(id, "Wel");
    store.getState().setNodeConfig(id, { title: "H" });
    store.getState().setNodeConfig(id, { title: "Hi" });
    expect(store.getState().past).toHaveLength(3);

    store.getState().undo();
    expect(dataOf(store.getState().nodes[0]).config).toEqual({});
    expect(dataOf(store.getState().nodes[0]).label).toBe("Wel");
    store.getState().undo();
    expect(store.getState().nodes[0]?.data.label).toBe("Screen");
  });

  test("a drag is one undo step and removals are undoable", () => {
    const store = setup();
    const id = store.getState().addNode("screen.page", { x: 0, y: 0 });
    const move = (x: number, dragging: boolean) =>
      store.getState().onNodesChange([{ type: "position", id, position: { x, y: 0 }, dragging }]);
    move(10, true);
    move(20, true);
    move(30, false);
    expect(store.getState().nodes[0]?.position.x).toBe(30);
    expect(store.getState().past).toHaveLength(2);
    store.getState().undo();
    expect(store.getState().nodes[0]?.position.x).toBe(0);

    store.getState().redo();
    store.getState().onNodesChange([{ type: "remove", id }]);
    expect(store.getState().nodes).toHaveLength(0);
    store.getState().undo();
    expect(store.getState().nodes).toHaveLength(1);
  });

  test("keyboard position changes are undoable without discarding an earlier edit", () => {
    const store = setup();
    const id = store.getState().addNode("screen.page", { x: 0, y: 0 });
    store
      .getState()
      .onNodesChange([{ type: "position", id, position: { x: 20, y: 0 }, dragging: false }]);

    store.getState().undo();
    expect(store.getState().nodes).toHaveLength(1);
    expect(store.getState().nodes[0]?.position).toEqual({ x: 0, y: 0 });
    store.getState().redo();
    expect(store.getState().nodes[0]?.position).toEqual({ x: 20, y: 0 });
  });

  test("starting another drag after a document replacement creates a new undo step", () => {
    const store = setup();
    const id = store.getState().addNode("screen.page", { x: 0, y: 0 });
    store
      .getState()
      .onNodesChange([{ type: "position", id, position: { x: 20, y: 0 }, dragging: true }]);
    const replacement = {
      ...createEmptyFlow("flow-1"),
      nodes: [
        {
          id: "new",
          type: "screen.page" as const,
          position: { x: 0, y: 0 },
          label: "New",
          config: {},
        },
      ],
    };
    store.getState().applyDocument(replacement);
    store
      .getState()
      .onNodesChange([{ type: "position", id: "new", position: { x: 40, y: 0 }, dragging: true }]);
    store
      .getState()
      .onNodesChange([{ type: "position", id: "new", position: { x: 40, y: 0 }, dragging: false }]);
    store.getState().undo();
    expect(store.getState().nodes[0]?.id).toBe("new");
    expect(store.getState().nodes[0]?.position).toEqual({ x: 0, y: 0 });
  });

  test("deleting a node and its edges in one tick is one undo step", () => {
    const store = setup();
    const a = store.getState().addNode("trigger.webhook", { x: 0, y: 0 });
    const b = store.getState().addNode("screen.page", { x: 300, y: 0 });
    store.getState().onConnect({ source: a, target: b, sourceHandle: null, targetHandle: null });
    const edgeId = store.getState().edges[0]!.id;
    store.getState().onEdgesChange([{ type: "remove", id: edgeId }]);
    store.getState().onNodesChange([{ type: "remove", id: b }]);
    expect(store.getState().nodes).toHaveLength(1);
    expect(store.getState().edges).toHaveLength(0);
    store.getState().undo();
    expect(store.getState().nodes).toHaveLength(2);
    expect(store.getState().edges).toHaveLength(1);
  });

  test("selection changes never create history and hydrate clears it", () => {
    const store = setup();
    const id = store.getState().addNode("screen.page", { x: 0, y: 0 });
    store.getState().onNodesChange([{ type: "select", id, selected: false }]);
    store.getState().clearSelection();
    expect(store.getState().past).toHaveLength(1);
    store.getState().hydrate(createEmptyFlow("flow-2"));
    expect(store.getState().past).toEqual([]);
    expect(store.getState().future).toEqual([]);
  });

  test("the undo stack is capped", () => {
    const store = setup();
    for (let index = 0; index < historyLimit + 10; index++)
      store.getState().addNode("screen.page", { x: index, y: 0 });
    expect(store.getState().past).toHaveLength(historyLimit);
  });
});

describe("duplicateNodes", () => {
  test("copies nodes and the edges between them, offset and selected", () => {
    const store = setup();
    const a = store.getState().addNode("trigger.webhook", { x: 0, y: 0 });
    const b = store.getState().addNode("screen.page", { x: 300, y: 0 });
    const c = store.getState().addNode("screen.form", { x: 600, y: 0 });
    store.getState().setNodeConfig(b, { title: "Hello" });
    store
      .getState()
      .onConnect({ source: a, target: b, sourceHandle: "request", targetHandle: "data" });
    store
      .getState()
      .onConnect({ source: b, target: c, sourceHandle: "next", targetHandle: "data" });

    const copies = store.getState().duplicateNodes([a, b]);
    expect(copies).toHaveLength(2);
    const state = store.getState();
    expect(state.nodes).toHaveLength(5);
    expect(state.nodes.filter((node) => node.selected).map((node) => node.id)).toEqual(copies);
    const copyOfB = state.nodes.find((node) => node.id === copies[1])!;
    expect(copyOfB.position).toEqual({ x: 340, y: 40 });
    expect(copyOfB.data).toEqual({
      type: "screen.page",
      label: "Screen",
      config: { title: "Hello" },
    });
    expect(state.edges).toHaveLength(3);
    expect(state.edges.at(-1)).toMatchObject({ source: copies[0], target: copies[1] });

    store.getState().undo();
    expect(store.getState().nodes).toHaveLength(3);
    expect(store.getState().duplicateNodes(["missing"])).toEqual([]);
  });
});

describe("setNodePositions", () => {
  test("moves the listed nodes as one undo step and ignores no-ops", () => {
    const store = setup();
    const a = store.getState().addNode("trigger.webhook", { x: 0, y: 0 });
    const b = store.getState().addNode("screen.page", { x: 5, y: 5 });
    const before = store.getState().past.length;
    store.getState().setNodePositions(new Map([[a, { x: 0, y: 0 }]]));
    expect(store.getState().past).toHaveLength(before);
    store.getState().setNodePositions(
      new Map([
        [a, { x: 80, y: 120 }],
        [b, { x: 380, y: 120 }],
        ["ghost", { x: 1, y: 1 }],
      ]),
    );
    expect(store.getState().nodes.map((node) => node.position)).toEqual([
      { x: 80, y: 120 },
      { x: 380, y: 120 },
    ]);
    expect(store.getState().past).toHaveLength(before + 1);
    store.getState().undo();
    expect(store.getState().nodes[1]?.position).toEqual({ x: 5, y: 5 });
  });
});

describe("removeNodes", () => {
  test("drops every listed node and the edges touching them as one history entry", () => {
    const store = setup();
    const a = store.getState().addNode("trigger.webhook", { x: 0, y: 0 });
    const b = store.getState().addNode("logic.wait", { x: 300, y: 0 });
    const c = store.getState().addNode("notify.discord", { x: 600, y: 0 });
    store.getState().onConnect({ source: a, sourceHandle: null, target: b, targetHandle: null });
    store.getState().onConnect({ source: b, sourceHandle: null, target: c, targetHandle: null });
    const before = store.getState().past.length;
    store.getState().removeNodes([a, b]);
    expect(store.getState().nodes.map((node) => node.id)).toEqual([c]);
    expect(store.getState().edges).toEqual([]);
    expect(store.getState().past.length).toBe(before + 1);
    store.getState().undo();
    expect(store.getState().nodes.length).toBe(3);
    expect(store.getState().edges.length).toBe(2);
  });

  test("ignores ids that are not on the canvas", () => {
    const store = setup();
    store.getState().addNode("trigger.webhook", { x: 0, y: 0 });
    const before = store.getState().past.length;
    store.getState().removeNodes(["missing"]);
    expect(store.getState().nodes.length).toBe(1);
    expect(store.getState().past.length).toBe(before);
  });
});

describe("alignNodes", () => {
  function three() {
    const store = setup();
    const a = store.getState().addNode("trigger.webhook", { x: 40, y: 100 });
    const b = store.getState().addNode("logic.wait", { x: 300, y: 20 });
    const c = store.getState().addNode("notify.discord", { x: 620, y: 260 });
    return { store, a, b, c };
  }

  test("left moves every node to the smallest x", () => {
    const { store, a, b, c } = three();
    store.getState().alignNodes([a, b, c], "left");
    expect(store.getState().nodes.map((node) => node.position.x)).toEqual([40, 40, 40]);
    expect(store.getState().nodes.map((node) => node.position.y)).toEqual([100, 20, 260]);
  });

  test("top moves every node to the smallest y", () => {
    const { store, a, b, c } = three();
    store.getState().alignNodes([a, b, c], "top");
    expect(store.getState().nodes.map((node) => node.position.y)).toEqual([20, 20, 20]);
  });

  test("centerY lines the nodes up on the middle of the selection using measured heights", () => {
    const { store, a, b, c } = three();
    store.getState().onNodesChange([
      { type: "dimensions", id: a, dimensions: { width: 248, height: 40 } },
      { type: "dimensions", id: b, dimensions: { width: 248, height: 100 } },
    ]);
    store.getState().alignNodes([a, b], "centerY");
    // Centres were 120 and 70, so the shared centre is 95.
    const byId = new Map(store.getState().nodes.map((node) => [node.id, node.position]));
    expect(byId.get(a)).toEqual({ x: 40, y: 75 });
    expect(byId.get(b)).toEqual({ x: 300, y: 45 });
    expect(byId.get(c)).toEqual({ x: 620, y: 260 });
  });

  test("a single node is left alone and adds no history", () => {
    const { store, a } = three();
    const before = store.getState().past.length;
    store.getState().alignNodes([a], "left");
    expect(store.getState().past.length).toBe(before);
  });
});

describe("selectAll", () => {
  test("selects every node and edge without touching history or dirty", () => {
    const store = setup();
    const a = store.getState().addNode("trigger.webhook", { x: 0, y: 0 });
    const b = store.getState().addNode("logic.wait", { x: 300, y: 0 });
    store.getState().onConnect({ source: a, sourceHandle: null, target: b, targetHandle: null });
    store.getState().markSaved();
    const before = store.getState().past.length;
    store.getState().selectAll();
    expect(store.getState().nodes.every((node) => node.selected)).toBe(true);
    expect(store.getState().edges.every((edge) => edge.selected)).toBe(true);
    expect(store.getState().past.length).toBe(before);
    expect(store.getState().dirty).toBe(false);
  });
});

describe("reconnectEdge", () => {
  function chain() {
    const store = setup();
    const a = store.getState().addNode("trigger.webhook", { x: 0, y: 0 });
    const b = store.getState().addNode("logic.wait", { x: 300, y: 0 });
    const c = store.getState().addNode("notify.discord", { x: 600, y: 0 });
    store.getState().onConnect({ source: a, sourceHandle: "run", target: b, targetHandle: "in" });
    const edge = store.getState().edges[0]!;
    return { store, a, b, c, edge };
  }

  test("moves the edge's target to another port as one history entry", () => {
    const { store, a, c, edge } = chain();
    const before = store.getState().past.length;
    const moved = store
      .getState()
      .reconnectEdge(edge, { source: a, sourceHandle: "run", target: c, targetHandle: "message" });
    expect(moved).toBe(true);
    expect(store.getState().edges).toEqual([
      { ...edge, source: a, sourceHandle: "run", target: c, targetHandle: "message" },
    ]);
    expect(store.getState().past.length).toBe(before + 1);
    expect(store.getState().dirty).toBe(true);
  });

  test("keeps the edge where it was when the new wiring would take a used input", () => {
    const { store, a, b, c } = chain();
    store
      .getState()
      .onConnect({ source: b, sourceHandle: "done", target: c, targetHandle: "message" });
    const other = store.getState().edges[1]!;
    const before = store.getState().past.length;
    expect(
      store
        .getState()
        .reconnectEdge(other, { source: a, sourceHandle: "run", target: b, targetHandle: "in" }),
    ).toBe(false);
    expect(store.getState().edges.map((item) => item.target)).toEqual([b, c]);
    expect(store.getState().past.length).toBe(before);
  });

  test("an edge may keep its own target while its source moves", () => {
    const { store, b, c, edge } = chain();
    store
      .getState()
      .onConnect({ source: b, sourceHandle: "done", target: c, targetHandle: "message" });
    // Moving the a→b edge to c→b is a cycle (b → c → b), so it is refused…
    expect(
      store
        .getState()
        .reconnectEdge(edge, { source: c, sourceHandle: "sent", target: b, targetHandle: "in" }),
    ).toBe(false);
    // …but re-pointing it at the same target with the same handle is not "a taken input".
    expect(
      store.getState().reconnectEdge(edge, {
        source: edge.source,
        sourceHandle: "run",
        target: b,
        targetHandle: "in",
      }),
    ).toBe(true);
  });
});

describe("removeEdge", () => {
  test("drops one edge as a history entry and ignores unknown ids", () => {
    const store = setup();
    const a = store.getState().addNode("trigger.webhook", { x: 0, y: 0 });
    const b = store.getState().addNode("logic.wait", { x: 300, y: 0 });
    store.getState().onConnect({ source: a, sourceHandle: null, target: b, targetHandle: null });
    const before = store.getState().past.length;
    store.getState().removeEdge("missing");
    expect(store.getState().past.length).toBe(before);
    store.getState().removeEdge(store.getState().edges[0]!.id);
    expect(store.getState().edges).toEqual([]);
    expect(store.getState().past.length).toBe(before + 1);
  });
});

describe("groups", () => {
  function pair() {
    const store = setup();
    const a = store.getState().addNode("trigger.webhook", { x: 100, y: 100 });
    const b = store.getState().addNode("logic.wait", { x: 400, y: 160 });
    return { store, a, b };
  }
  const frameOf = (store: ReturnType<typeof setup>, id: string) => {
    const node = store.getState().nodes.find((item) => item.id === id);
    if (!node || node.type !== "group") throw new Error("expected a frame");
    return node;
  };
  const flowOf = (store: ReturnType<typeof setup>, id: string) => {
    const node = store.getState().nodes.find((item) => item.id === id);
    if (!node || !isFlowNode(node)) throw new Error("expected a flow node");
    return node;
  };

  test("groupNodes draws a frame around the nodes and puts them in it, first in the list", () => {
    const { store, a, b } = pair();
    const before = store.getState().past.length;
    const id = store.getState().groupNodes([a, b])!;
    expect(id).toEqual(expect.any(String));
    expect(store.getState().nodes[0]?.id).toBe(id);
    // Left 100 - 24 = 76 → snapped 80; top 100 - 24 - 32 = 44 → 40. Right edge 400 + 248 + 24
    // = 672 → width from 80 rounds up to 600; bottom 160 + 72 + 24 = 256 → height 220.
    expect(frameOf(store, id)).toMatchObject({
      position: { x: 80, y: 40 },
      width: 600,
      height: 220,
      data: { label: "Group" },
      selected: true,
    });
    expect(flowOf(store, a)).toMatchObject({
      parentId: id,
      position: { x: 20, y: 60 },
      selected: false,
    });
    expect(flowOf(store, b)).toMatchObject({ parentId: id, position: { x: 320, y: 120 } });
    expect(store.getState().past.length).toBe(before + 1);
    expect(
      serializeFlow(store.getState().meta, store.getState().nodes, store.getState().edges).nodes,
    ).toMatchObject([
      { id: a, position: { x: 100, y: 100 }, parentId: id },
      { id: b, position: { x: 400, y: 160 }, parentId: id },
    ]);
  });

  test("groupNodes with nothing to group does nothing", () => {
    const { store } = pair();
    expect(store.getState().groupNodes(["missing"])).toBeNull();
    expect(store.getState().nodes).toHaveLength(2);
  });

  test("ungroup removes the frame and leaves the nodes where they were, selected", () => {
    const { store, a, b } = pair();
    const id = store.getState().groupNodes([a, b])!;
    store.getState().ungroup(id);
    expect(store.getState().nodes.map((node) => node.id)).toEqual([a, b]);
    expect(flowOf(store, a)).toMatchObject({ position: { x: 100, y: 100 }, selected: true });
    expect(flowOf(store, a)).not.toHaveProperty("parentId");
    store.getState().undo();
    expect(store.getState().nodes[0]?.id).toBe(id);
  });

  test("removing a frame through React Flow frees the nodes it lists along with it", () => {
    const { store, a, b } = pair();
    const id = store.getState().groupNodes([a, b])!;
    // React Flow removes a parent's children with it; only the frame was selected here.
    store.getState().onNodesChange([
      { type: "remove", id },
      { type: "remove", id: a },
      { type: "remove", id: b },
    ]);
    expect(store.getState().nodes.map((node) => node.id)).toEqual([a, b]);
    expect(flowOf(store, b)).toMatchObject({ position: { x: 400, y: 160 } });
  });

  test("a node selected together with its frame is removed with it", () => {
    const { store, a, b } = pair();
    const id = store.getState().groupNodes([a, b])!;
    store.getState().onNodesChange([{ type: "select", id: a, selected: true }]);
    store.getState().onNodesChange([
      { type: "remove", id },
      { type: "remove", id: a },
      { type: "remove", id: b },
    ]);
    expect(store.getState().nodes.map((node) => node.id)).toEqual([b]);
  });

  test("removeNodes on a frame releases its nodes; on a frame and a node, keeps only the rest", () => {
    const { store, a, b } = pair();
    const id = store.getState().groupNodes([a, b])!;
    store.getState().removeNodes([id, a]);
    expect(store.getState().nodes.map((node) => node.id)).toEqual([b]);
    expect(flowOf(store, b)).not.toHaveProperty("parentId");
  });

  test("a node dragged fully out of its frame leaves it; one dropped inside joins", () => {
    const { store, a, b } = pair();
    const id = store.getState().groupNodes([a])!;
    const frame = frameOf(store, id);
    const width = frame.width ?? 0;
    // Drag a far to the right of the frame (relative position past the frame's width).
    store
      .getState()
      .onNodesChange([
        { type: "position", id: a, position: { x: width + 100, y: 20 }, dragging: true },
      ]);
    store.getState().onNodesChange([{ type: "position", id: a, dragging: false }]);
    expect(flowOf(store, a)).not.toHaveProperty("parentId");
    expect(flowOf(store, a).position).toEqual({
      x: frame.position.x + width + 100,
      y: frame.position.y + 20,
    });
    // Drop b inside the frame: its absolute box must sit fully within the frame.
    store.getState().onNodesChange([
      {
        type: "position",
        id: b,
        position: { x: frame.position.x + 40, y: frame.position.y + 60 },
        dragging: true,
      },
    ]);
    store.getState().onNodesChange([{ type: "position", id: b, dragging: false }]);
    expect(flowOf(store, b)).toMatchObject({ parentId: id, position: { x: 40, y: 60 } });
  });

  test("tidy up keeps a node in its frame and refits the frame around it", () => {
    const { store, a, b } = pair();
    const id = store.getState().groupNodes([a])!;
    store.getState().setNodePositions(
      new Map([
        [a, { x: 800, y: 600 }],
        [b, { x: 1100, y: 600 }],
      ]),
    );
    const frame = frameOf(store, id);
    expect(frame.position).toEqual({ x: 780, y: 540 });
    expect(flowOf(store, a)).toMatchObject({ parentId: id, position: { x: 20, y: 60 } });
    expect(flowOf(store, b).position).toEqual({ x: 1100, y: 600 });
  });

  test("duplicating a node in a frame keeps the copy in the frame and skips the frame itself", () => {
    const { store, a, b } = pair();
    const id = store.getState().groupNodes([a, b])!;
    const copies = store.getState().duplicateNodes([id, a]);
    expect(copies).toHaveLength(1);
    expect(flowOf(store, copies[0]!)).toMatchObject({ parentId: id, position: { x: 60, y: 100 } });
  });

  test("resizing a frame is a document change that coalesces into one undo step", () => {
    const { store, a } = pair();
    const id = store.getState().groupNodes([a])!;
    store.getState().markSaved();
    const before = store.getState().past.length;
    store.getState().onNodesChange([
      {
        type: "dimensions",
        id,
        dimensions: { width: 700, height: 300 },
        setAttributes: true,
        resizing: true,
      },
    ]);
    store.getState().onNodesChange([
      {
        type: "dimensions",
        id,
        dimensions: { width: 720, height: 320 },
        setAttributes: true,
        resizing: false,
      },
    ]);
    expect(frameOf(store, id)).toMatchObject({ width: 720, height: 320 });
    expect(store.getState().dirty).toBe(true);
    expect(store.getState().past.length).toBe(before + 1);
  });

  test("renameNode renames a frame too", () => {
    const { store, a } = pair();
    const id = store.getState().groupNodes([a])!;
    store.getState().renameNode(id, "Checkout");
    expect(frameOf(store, id).data.label).toBe("Checkout");
  });
});

describe("preview", () => {
  const ping: FlowDocument = {
    version: 1,
    id: "flow-1",
    name: "Ping",
    description: "",
    nodes: [
      {
        id: "t",
        type: "trigger.manual",
        label: "Run",
        config: {},
        position: { x: 0, y: 0 },
      },
      {
        id: "d",
        type: "notify.discord",
        label: "Post",
        config: {},
        position: { x: 300, y: 0 },
      },
    ],
    edges: [{ id: "e", source: "t", target: "d" }],
  };
  const draft = (nodes: FlowDocument["nodes"], edges: FlowDocument["edges"] = []) => {
    const { id: _id, ...input } = ping;
    return { ...input, nodes, edges };
  };

  test("hydrates the draft, marks kinds, and keeps the real document", () => {
    const store = createBuilderStore(ping);
    store.getState().setPreview(draft([ping.nodes[0]!]));
    const preview = store.getState().preview!;
    expect(preview.nodes.map((node) => node.id)).toEqual(["t", "d"]);
    expect(preview.kinds.nodes.get("t")).toBe("kept");
    expect(preview.kinds.nodes.get("d")).toBe("removed");
    expect(preview.edges.map((edge) => edge.id)).toEqual(["e"]);
    expect(preview.kinds.edges.get("e")).toBe("removed");
    expect(store.getState().nodes).toHaveLength(2);
    store.getState().onPreviewNodesChange([{ type: "select", id: "t", selected: true }]);
    expect(selectSelectedNodes(store.getState()).map((node) => node.id)).toEqual(["t"]);
    store.getState().setPreview(null);
    expect(store.getState().preview).toBeNull();
  });

  test("clearing the preview leaves the real nodes and edges untouched", () => {
    const store = createBuilderStore(ping);
    const before = store.getState();
    store
      .getState()
      .setPreview(
        draft([
          ...ping.nodes,
          { id: "w", type: "logic.wait", label: "Wait", config: {}, position: { x: 600, y: 0 } },
        ]),
      );
    store.getState().onPreviewNodesChange([{ type: "select", id: "w", selected: true }]);
    store.getState().setPreview(null);
    expect(store.getState().nodes).toBe(before.nodes);
    expect(store.getState().edges).toBe(before.edges);
    expect(store.getState().dirty).toBe(false);
    expect(store.getState().past).toEqual([]);
  });

  test("only selection and measurement reach the preview", () => {
    const store = createBuilderStore(ping);
    store.getState().setPreview(draft(ping.nodes));
    const before = store.getState().preview!.nodes;
    store.getState().onPreviewNodesChange([{ type: "remove", id: "d" }]);
    expect(store.getState().preview!.nodes).toBe(before);
    store
      .getState()
      .onPreviewNodesChange([
        { type: "dimensions", id: "t", dimensions: { width: 200, height: 80 } },
      ]);
    expect(store.getState().preview!.nodes.map((node) => node.id)).toEqual(["t", "d"]);
  });

  test("a draft freezes the document: nothing edits it while one is on show", () => {
    const store = createBuilderStore(ping);
    store.getState().onConnect({
      source: "d",
      sourceHandle: null,
      target: "t",
      targetHandle: null,
    });
    store.getState().renameNode("t", "Start");
    const before = store.getState();
    store.getState().setPreview(draft([ping.nodes[0]!]));
    const preview = store.getState().preview;

    expect(store.getState().addNode("logic.wait", { x: 0, y: 200 })).toBe("");
    expect(
      store
        .getState()
        .insertNode({ type: "logic.wait", label: "Wait", config: {} }, { x: 0, y: 0 }),
    ).toBe("");
    expect(store.getState().duplicateNodes(["t"])).toEqual([]);
    expect(store.getState().groupNodes(["t", "d"])).toBeNull();
    store.getState().ungroup("t");
    store.getState().selectAll();
    store.getState().renameNode("t", "Renamed");
    store.getState().setNodeConfig("d", { message: "hi" });
    store.getState().removeNode("d");
    store.getState().removeNodes(["d"]);
    store.getState().setMeta({ name: "Pong" });
    store.getState().setNodePositions(new Map([["t", { x: 999, y: 999 }]]));
    store.getState().alignNodes(["t", "d"], "left");
    store.getState().removeEdge("e");
    store.getState().onNodesChange([{ type: "remove", id: "t" }]);
    store.getState().onEdgesChange([{ type: "remove", id: "e" }]);
    store.getState().undo();
    store.getState().redo();

    expect(store.getState().nodes).toBe(before.nodes);
    expect(store.getState().edges).toBe(before.edges);
    expect(store.getState().meta).toBe(before.meta);
    expect(store.getState().past).toBe(before.past);
    expect(store.getState().future).toBe(before.future);
    expect(store.getState().preview).toBe(preview);
    expect(selectCanUndo(store.getState())).toBe(false);
    expect(selectCanRedo(store.getState())).toBe(false);

    store.getState().setPreview(null);
    expect(selectCanUndo(store.getState())).toBe(true);
    store.getState().undo();
    expect(store.getState().nodes).not.toBe(before.nodes);
  });

  test("applying a draft still works while it is on show", () => {
    const store = createBuilderStore(ping);
    const applied = draft([ping.nodes[0]!]);
    store.getState().setPreview(applied);
    store.getState().applyDocument(applied);
    expect(store.getState().nodes.map((node) => node.id)).toEqual(["t"]);
    expect(store.getState().dirty).toBe(true);
  });

  test("a draft takes the selection over from the canvas", () => {
    const store = createBuilderStore(ping);
    store.getState().onNodesChange([{ type: "select", id: "d", selected: true }]);
    expect(selectSelectedNodes(store.getState()).map((node) => node.id)).toEqual(["d"]);
    store.getState().setPreview(draft(ping.nodes));
    expect(store.getState().nodes.some((node) => node.selected)).toBe(false);
    expect(selectSelectedNodes(store.getState())).toEqual([]);
    store.getState().setPreview(null);
    expect(selectSelectedNodes(store.getState())).toEqual([]);
  });

  test("a draft's labels cannot be edited on the card", () => {
    const store = createBuilderStore(ping);
    store.getState().setPreview(draft(ping.nodes));
    store.getState().setRenaming("t");
    expect(store.getState().renaming).toBeNull();
    store.getState().setPreview(null);
    store.getState().setRenaming("t");
    expect(store.getState().renaming).toBe("t");
  });

  test("a removed node in a frame is drawn where it sits on the canvas", () => {
    const store = createBuilderStore(ping);
    const group = store.getState().groupNodes(["t", "d"])!;
    const inside = store.getState().nodes.find((node) => node.id === "d")!;
    const frame = store.getState().nodes.find((node) => node.id === group)!;
    store.getState().setPreview(draft([ping.nodes[0]!]));
    const removed = store.getState().preview!.nodes.find((node) => node.id === "d")!;
    expect(removed.parentId).toBeUndefined();
    expect(removed.position).toEqual({
      x: inside.position.x + frame.position.x,
      y: inside.position.y + frame.position.y,
    });
  });
});

describe("applyDocument with frames", () => {
  function framed() {
    const store = setup();
    const a = store.getState().addNode("trigger.webhook", { x: 100, y: 100 });
    const b = store.getState().addNode("logic.wait", { x: 400, y: 160 });
    const group = store.getState().groupNodes([a, b])!;
    const current = serializeFlow(
      store.getState().meta,
      store.getState().nodes,
      store.getState().edges,
    );
    // What an AI edit answers with: no frames, no parents, one node moved and one gone.
    const { groups: _groups, ...edited } = current;
    const proposal = {
      ...edited,
      nodes: current.nodes
        .filter((node) => node.id === a)
        .map(({ parentId: _parent, ...node }) => ({ ...node, position: { x: 700, y: 500 } })),
    };
    return { store, a, b, group, proposal };
  }

  test("keepGroups carries a frame over to its surviving node and refits it", () => {
    const { store, a, group, proposal } = framed();
    store.getState().applyDocument(proposal, { keepGroups: true });
    const nodes = store.getState().nodes;
    expect(nodes.map((node) => node.id)).toEqual([group, a]);
    // Left 700 - 24 = 676 → 680; top 500 - 56 = 444 → 440; right 700 + 248 + 24 = 972 → 300
    // wide from 680; bottom 500 + 72 + 24 = 596 → 160 tall from 440.
    expect(nodes[0]).toMatchObject({
      type: "group",
      position: { x: 680, y: 440 },
      width: 300,
      height: 160,
      selected: false,
    });
    expect(nodes[1]).toMatchObject({ parentId: group, position: { x: 20, y: 60 } });
    expect(
      serializeFlow(store.getState().meta, nodes, store.getState().edges).nodes[0],
    ).toMatchObject({ id: a, position: { x: 700, y: 500 }, parentId: group });
  });

  test("keepGroups draws the frame on the preview too, refitted, leaving the canvas alone", () => {
    const { store, a, b, group, proposal } = framed();
    const flow = () =>
      serializeFlow(store.getState().meta, store.getState().nodes, store.getState().edges);
    const before = flow();
    store.getState().setPreview(proposal, { keepGroups: true });
    const preview = store.getState().preview!;
    expect(preview.nodes.map((node) => node.id)).toEqual([group, a, b]);
    expect(preview.nodes[0]).toMatchObject({
      type: "group",
      position: { x: 680, y: 440 },
      width: 300,
      height: 160,
    });
    expect(preview.nodes[1]).toMatchObject({ parentId: group, position: { x: 20, y: 60 } });
    // The dropped node is drawn faded, freed from the frame, where it sits on the canvas.
    expect(preview.nodes[2]).toMatchObject({ id: b, position: { x: 400, y: 160 } });
    expect(preview.nodes[2]!.parentId).toBeUndefined();
    expect(preview.kinds.nodes.get(b)).toBe("removed");
    // Only the preview holds the edit: the canvas keeps its nodes, frame and memberships.
    expect(flow()).toEqual(before);
    store.getState().setPreview(null);
    expect(flow()).toEqual(before);
  });

  test("a frame with no surviving node goes, and without keepGroups every frame goes", () => {
    const { store, a, group, proposal } = framed();
    store.getState().applyDocument({ ...proposal, nodes: [] }, { keepGroups: true });
    expect(store.getState().nodes).toEqual([]);
    const again = framed();
    again.store.getState().applyDocument(again.proposal);
    expect(again.store.getState().nodes.map((node) => node.id)).toEqual([again.a]);
    expect(store.getState().nodes.find((node) => node.id === group)).toBeUndefined();
    expect(a).toEqual(expect.any(String));
  });
});
