import { flowDocumentSchema, Value } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { createEmptyFlow, serializeFlow } from "./document";
import { createBuilderStore, historyLimit } from "./store";

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
    expect(node?.data.config).toEqual({ content: "hi", username: "Bot" });
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
    expect(state.nodes.map((node) => [node.id, node.data.type])).toEqual([
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
    expect(store.getState().nodes[0]?.data.type).toBe("screen.page");
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
    expect(store.getState().nodes[0]?.data.config).toEqual({});
    expect(store.getState().nodes[0]?.data.label).toBe("Wel");
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
