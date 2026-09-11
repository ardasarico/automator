import type { FlowDocument, FlowEdge, FlowNode } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { diffConnections, diffNodes, previewKinds } from "./diff";

const node = (id: string, type: FlowNode["type"], label: string, config = {}): FlowNode => ({
  id,
  type,
  label,
  config,
  position: { x: 0, y: 0 },
});

const document = (nodes: FlowNode[], edges: FlowEdge[] = []): FlowDocument => ({
  version: 1,
  id: "flow-1",
  name: "Ping",
  description: "",
  nodes,
  edges,
});

test("connection previews show rewired handles even when all node configs stay the same", () => {
  const original = {
    id: "e",
    source: "condition",
    sourceHandle: "true",
    target: "notify",
    targetHandle: "message",
  };
  const rewired = { ...original, sourceHandle: "false" };
  expect(diffConnections([original], [rewired])).toEqual([
    { kind: "added", edge: rewired },
    { kind: "removed", edge: original },
  ]);
  expect(diffConnections([original], [{ ...original, id: "regenerated" }])).toEqual([]);
});

describe("diffNodes", () => {
  test("lists next nodes in order with their change, then removed ones", () => {
    const current = [
      node("a", "trigger.manual", "Run"),
      node("b", "logic.wait", "Wait"),
      node("c", "notify.discord", "Post"),
    ];
    const next = [
      node("a", "trigger.manual", "Run"),
      node("b", "logic.wait", "Wait", { seconds: 5 }),
      node("d", "screen.page", "Done"),
    ];
    expect(diffNodes(current, next).map((change) => [change.kind, change.id])).toEqual([
      ["kept", "a"],
      ["changed", "b"],
      ["added", "d"],
      ["removed", "c"],
    ]);
  });

  test("an empty canvas makes everything added", () => {
    expect(
      diffNodes([], [node("a", "trigger.manual", "Run")]).map((change) => change.kind),
    ).toEqual(["added"]);
  });
});

describe("previewKinds", () => {
  test("keys every node and edge the draft draws, removals included", () => {
    const wait = { id: "e1", source: "a", target: "b" };
    const current = document(
      [
        node("a", "trigger.manual", "Run"),
        node("b", "logic.wait", "Wait"),
        node("c", "notify.discord", "Post"),
      ],
      [wait, { id: "e2", source: "b", target: "c" }],
    );
    const kinds = previewKinds(current, {
      ...current,
      nodes: [
        node("a", "trigger.manual", "Run"),
        node("b", "logic.wait", "Wait", { seconds: 5 }),
        node("d", "screen.page", "Done"),
      ],
      edges: [wait, { id: "e3", source: "b", target: "d" }],
    });
    expect([...kinds.nodes]).toEqual([
      ["a", "kept"],
      ["b", "changed"],
      ["d", "added"],
      ["c", "removed"],
    ]);
    expect([...kinds.edges]).toEqual([
      ["e2", "removed"],
      ["e1", "kept"],
      ["e3", "added"],
    ]);
  });

  test("a node and an edge that share an id keep their own kinds", () => {
    const current = document([node("x", "trigger.manual", "Run")], []);
    const kinds = previewKinds(current, {
      ...current,
      nodes: [node("x", "trigger.manual", "Run"), node("y", "notify.discord", "Post")],
      edges: [{ id: "x", source: "x", target: "y" }],
    });
    expect(kinds.nodes.get("x")).toBe("kept");
    expect(kinds.edges.get("x")).toBe("added");
  });

  test("an edge that keeps its id but moves is added, not removed", () => {
    const current = document(
      [node("a", "logic.condition", "Ask"), node("b", "notify.discord", "Post")],
      [{ id: "e", source: "a", sourceHandle: "true", target: "b" }],
    );
    const kinds = previewKinds(current, {
      ...current,
      edges: [{ id: "e", source: "a", sourceHandle: "false", target: "b" }],
    });
    expect(kinds.edges.get("e")).toBe("added");
  });
});
