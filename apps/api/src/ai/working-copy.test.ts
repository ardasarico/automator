import { describe, expect, test } from "bun:test";
import { ToolCallError, WorkingCopy } from "./working-copy";

describe("working copy", () => {
  test("adds, connects and lays out nodes", () => {
    const copy = new WorkingCopy();
    expect(copy.addNode({ id: "t", type: "trigger.manual", label: "Run", config: {} })).toBe(
      'Added "Run" (trigger.manual) as t',
    );
    copy.addNode({ id: "d", type: "notify.discord", label: "Post", config: { content: "hi" } });
    expect(
      copy.connect({ source: "t", sourceHandle: "run", target: "d", targetHandle: "message" }),
    ).toBe("Connected t.run → d.message");
    const preview = copy.toPreview();
    expect(preview.nodes.map((node) => node.id)).toEqual(["t", "d"]);
    expect(preview.nodes[1]!.position.x).toBeGreaterThan(preview.nodes[0]!.position.x);
    expect(preview.edges).toHaveLength(1);
    expect(copy.changed).toBe(true);
  });

  test("rejects an unknown type, a duplicate id, and an unknown handle", () => {
    const copy = new WorkingCopy();
    expect(() => copy.addNode({ id: "x", type: "notify.pigeon", label: "", config: {} })).toThrow(
      ToolCallError,
    );
    copy.addNode({ id: "t", type: "trigger.manual", label: "Run", config: {} });
    expect(() =>
      copy.addNode({ id: "t", type: "trigger.manual", label: "Run", config: {} }),
    ).toThrow(/already exists/);
    copy.addNode({ id: "d", type: "notify.discord", label: "Post", config: {} });
    expect(() =>
      copy.connect({ source: "t", sourceHandle: "run", target: "d", targetHandle: "content" }),
    ).toThrow(/"content" is not an input of notify\.discord; inputs are \[message\]/);
  });

  test("allows one edge per input, no self edge, no cycle", () => {
    const copy = new WorkingCopy();
    copy.addNode({ id: "t", type: "trigger.manual", label: "Run", config: {} });
    copy.addNode({
      id: "a",
      type: "logic.set-variable",
      label: "A",
      config: { name: "x", value: "1" },
    });
    copy.addNode({
      id: "b",
      type: "logic.set-variable",
      label: "B",
      config: { name: "y", value: "2" },
    });
    copy.connect({ source: "t", sourceHandle: "run", target: "a", targetHandle: "value" });
    expect(() =>
      copy.connect({ source: "t", sourceHandle: "run", target: "a", targetHandle: "value" }),
    ).toThrow(/already has an edge/);
    expect(() =>
      copy.connect({ source: "a", sourceHandle: "value", target: "a", targetHandle: "value" }),
    ).toThrow(/itself/);
    copy.connect({ source: "a", sourceHandle: "value", target: "b", targetHandle: "value" });
    expect(() =>
      copy.connect({ source: "b", sourceHandle: "value", target: "t", targetHandle: "value" }),
    ).toThrow(/cycle|has no input/);
  });

  test("rejects a cycle formed entirely of non-trigger nodes", () => {
    const copy = new WorkingCopy();
    copy.addNode({ id: "a", type: "logic.set-variable", label: "A", config: {} });
    copy.addNode({ id: "b", type: "logic.set-variable", label: "B", config: {} });
    copy.addNode({ id: "c", type: "logic.set-variable", label: "C", config: {} });
    copy.connect({ source: "a", sourceHandle: "value", target: "b", targetHandle: "value" });
    copy.connect({ source: "b", sourceHandle: "value", target: "c", targetHandle: "value" });
    expect(() =>
      copy.connect({ source: "c", sourceHandle: "value", target: "a", targetHandle: "value" }),
    ).toThrow(/cycle/);
  });

  test("cleans config through the node schema and reports unknown fields", () => {
    const copy = new WorkingCopy();
    copy.addNode({
      id: "d",
      type: "notify.discord",
      label: "Post",
      config: { content: "hi", nope: 1 },
    });
    expect(copy.toDraft().nodes[0]!.config).not.toHaveProperty("nope");
    expect(copy.updateNode({ id: "d", config: { content: "hello" } })).toBe('Updated "Post"');
    expect(copy.toDraft().nodes[0]!.config).toMatchObject({ content: "hello" });
    expect(() => copy.updateNode({ id: "zz" })).toThrow(/No node "zz"/);
    expect(() => copy.updateNode({ id: "d", label: "Changed", config: { content: 123 } })).toThrow(
      ToolCallError,
    );
    expect(copy.toDraft().nodes[0]!.label).toBe("Post");
  });

  test("starts from the current document and tracks change", () => {
    const copy = new WorkingCopy({
      version: 1,
      name: "Ping",
      description: "",
      nodes: [
        { id: "t", type: "trigger.manual", position: { x: 5, y: 5 }, label: "Run", config: {} },
      ],
      edges: [],
    });
    expect(copy.changed).toBe(false);
    expect(copy.setFlow({ name: "Pong" })).toBe('Renamed the flow to "Pong"');
    expect(copy.changed).toBe(true);
    expect(() => copy.setFlow({ chainId: 1 })).toThrow(/chainId/);
    expect(() => copy.setFlow({ name: "Should not stick", chainId: 999 })).toThrow(/chainId/);
    expect(copy.toDraft().name).toBe("Pong");
    expect(() => copy.setFlow({ name: "" })).toThrow(/"name" must be a non-empty string/);
    expect(copy.removeNode({ id: "t" })).toBe('Removed "Run" and 0 edges');
    expect(copy.toDraft().nodes).toEqual([]);
  });
});
