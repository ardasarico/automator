import type { FlowDocument } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { runFlow } from "./engine";

function loopFlow(items: unknown, extra: Partial<FlowDocument> = {}): FlowDocument {
  return {
    version: 1,
    id: "flow",
    name: "Loop",
    description: "",
    nodes: [
      { id: "start", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Start", config: {} },
      {
        id: "each",
        type: "logic.for-each",
        position: { x: 1, y: 0 },
        label: "Each",
        config: { items: "{{trigger.items}}" },
      },
      {
        id: "keep",
        type: "logic.set-variable",
        position: { x: 2, y: 0 },
        label: "Keep",
        config: { name: "last", value: "{{input.value}}" },
      },
      {
        id: "check",
        type: "logic.condition",
        position: { x: 3, y: 0 },
        label: "Check",
        config: { left: "{{input.value}}", operator: "equals", right: "b" },
      },
      {
        id: "after",
        type: "logic.set-variable",
        position: { x: 2, y: 1 },
        label: "After",
        config: { name: "count", value: "{{input.value.count}}" },
      },
    ],
    edges: [
      { id: "e1", source: "start", sourceHandle: "run", target: "each", targetHandle: "items" },
      { id: "e2", source: "each", sourceHandle: "item", target: "keep", targetHandle: "value" },
      { id: "e3", source: "keep", sourceHandle: "value", target: "check", targetHandle: "value" },
      { id: "e4", source: "each", sourceHandle: "done", target: "after", targetHandle: "value" },
    ],
    ...extra,
  };
}

describe("logic.for-each", () => {
  test("results follow execution order even when canvas nodes are stored in reverse order", async () => {
    const flow = loopFlow(null);
    flow.nodes.reverse();
    const run = await runFlow(flow, { trigger: { payload: { items: ["a", "b"] } } });
    expect(run.status).toBe("succeeded");
    expect(run.nodes.find((node) => node.nodeId === "each")?.outputs).toMatchObject({
      done: { results: [{ false: "a" }, { true: "b" }] },
    });
  });

  test("runs the body once per item, carries vars, and fires done with the results", async () => {
    const run = await runFlow(loopFlow(["a", "b", "c"]), {
      trigger: { payload: { items: ["a", "b", "c"] } },
    });
    expect(run.status).toBe("succeeded");
    const each = run.nodes.find((node) => node.nodeId === "each")!;
    expect(each.status).toBe("succeeded");
    expect(each.outputs).toEqual({
      item: "c",
      done: {
        items: ["a", "b", "c"],
        results: [{ false: "a" }, { true: "b" }, { false: "c" }],
        count: 3,
      },
    });
    expect(run.nodes.find((node) => node.nodeId === "keep")?.outputs).toEqual({ value: "c" });
    expect(run.nodes.find((node) => node.nodeId === "check")?.outputs).toEqual({ false: "c" });
    expect(run.nodes.find((node) => node.nodeId === "after")?.status).toBe("succeeded");
    expect(run.variables).toEqual({ last: "c", count: 3 });
  });

  test("an empty list runs nothing and fires done with no results", async () => {
    const run = await runFlow(loopFlow([]), { trigger: { payload: { items: [] } } });
    expect(run.status).toBe("succeeded");
    expect(run.nodes.find((node) => node.nodeId === "each")?.outputs).toEqual({
      done: { items: [], results: [], count: 0 },
    });
    expect(run.nodes.find((node) => node.nodeId === "keep")?.status).toBe("skipped");
    expect(run.variables).toEqual({ count: 0 });
  });

  test("items that are not a list, and a failing pass, fail the for-each node", async () => {
    const notList = await runFlow(loopFlow("x"), { trigger: { payload: { items: "nope" } } });
    expect(notList.nodes.find((node) => node.nodeId === "each")?.error).toBe(
      "For each needs a list: the items did not resolve to one",
    );
    const failing = loopFlow(null);
    failing.nodes[2]!.config = { name: "", value: "x" };
    const run = await runFlow(failing, { trigger: { payload: { items: [1, 2] } } });
    expect(run.status).toBe("failed");
    expect(run.nodes.find((node) => node.nodeId === "each")?.error).toBe(
      "Item 1 of 2 failed: Set variable needs a variable name",
    );
    expect(run.nodes.find((node) => node.nodeId === "after")?.status).toBe("skipped");
  });

  test("caps the items and refuses screens inside the body", async () => {
    const many = Array.from({ length: 150 }, (_, index) => index);
    const capped = loopFlow(many);
    capped.nodes[1]!.config = { items: "{{trigger.items}}", maxItems: 5 };
    const run = await runFlow(capped, { trigger: { payload: { items: many } } });
    expect(run.nodes.find((node) => node.nodeId === "each")?.outputs).toMatchObject({
      done: { count: 5 },
    });

    const withScreen = loopFlow(null);
    withScreen.nodes.push({
      id: "page",
      type: "screen.page",
      position: { x: 4, y: 0 },
      label: "Page",
      config: {},
    });
    withScreen.edges.push({
      id: "e5",
      source: "check",
      sourceHandle: "true",
      target: "page",
      targetHandle: "data",
    });
    const refused = await runFlow(withScreen, { trigger: { payload: { items: [1] } } });
    expect(refused.nodes.find((node) => node.nodeId === "each")?.error).toBe(
      "A screen cannot be inside a loop; move it after Done",
    );
  });

  test("accepts JSON text as the list", async () => {
    const run = await runFlow(loopFlow(null), { trigger: { payload: { items: '["x"]' } } });
    expect(run.nodes.find((node) => node.nodeId === "each")?.outputs).toMatchObject({
      done: { items: ["x"], count: 1 },
    });
  });
});
