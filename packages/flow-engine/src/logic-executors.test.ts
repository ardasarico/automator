import type { FlowDocument, FlowEdge, FlowNode, FlowNodeType } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { runFlow } from "./engine";
import { defaultExecutors } from "./executors";
import { logicExecutors } from "./logic-executors";

const executors = { ...defaultExecutors, ...logicExecutors };

function node(id: string, type: FlowNodeType, config: Record<string, unknown> = {}): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, label: id, config };
}
function edge(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): FlowEdge {
  return {
    id: `${source}:${sourceHandle}-${target}:${targetHandle}`,
    source,
    sourceHandle,
    target,
    targetHandle,
  };
}
function flow(nodes: FlowNode[], edges: FlowEdge[]): FlowDocument {
  return { version: 1, id: "flow-1", name: "Logic", description: "", nodes, edges };
}
const options = {
  executors,
  now: () => new Date("2026-09-07T10:00:00.000Z"),
  sleep: async () => {},
};
const outputs = (run: Awaited<ReturnType<typeof runFlow>>, id: string) =>
  run.nodes.find((result) => result.nodeId === id)?.outputs;

describe("logic.switch", () => {
  const document = flow(
    [node("t", "trigger.manual"), node("s", "logic.switch", { cases: ["gold", "silver"] })],
    [edge("t", "run", "s", "value")],
  );

  test("routes a matching value to match and anything else to default", async () => {
    const gold = await runFlow(document, { ...options, trigger: { payload: "gold" } });
    expect(gold.status).toBe("succeeded");
    expect(outputs(gold, "s")).toEqual({ match: "gold" });
    const bronze = await runFlow(document, { ...options, trigger: { payload: "bronze" } });
    expect(outputs(bronze, "s")).toEqual({ default: "bronze" });
  });

  test("compares like the condition node, so numbers match their text", async () => {
    const run = await runFlow(
      flow(
        [node("t", "trigger.manual"), node("s", "logic.switch", { cases: ["5"] })],
        [edge("t", "run", "s", "value")],
      ),
      { ...options, trigger: { payload: 5 } },
    );
    expect(outputs(run, "s")).toEqual({ match: 5 });
  });
});

describe("logic.merge", () => {
  function merging(mode: string, payload: unknown) {
    return runFlow(
      flow(
        [
          node("t", "trigger.manual"),
          node("a", "logic.set-variable", { name: "a", value: "{{input.value.a}}" }),
          node("gate", "logic.condition", {
            left: "{{input.value.b}}",
            operator: "is_not_empty",
          }),
          node("b", "logic.set-variable", { name: "b", value: "{{input.value.b}}" }),
          node("m", "logic.merge", { mode }),
        ],
        [
          edge("t", "run", "a", "value"),
          edge("t", "run", "gate", "value"),
          edge("gate", "true", "b", "value"),
          edge("a", "value", "m", "a"),
          edge("b", "value", "m", "b"),
        ],
      ),
      { ...options, trigger: { payload } },
    );
  }

  test("combine merges two objects shallowly with B winning", async () => {
    const run = await merging("combine", { a: { x: 1, y: 1 }, b: { y: 2, z: 3 } });
    expect(run.status).toBe("succeeded");
    expect(outputs(run, "m")).toEqual({ merged: { x: 1, y: 2, z: 3 } });
  });

  test("combine keeps non-objects side by side and passes a lone input through", async () => {
    expect(outputs(await merging("combine", { a: 1, b: "two" }), "m")).toEqual({
      merged: { a: 1, b: "two" },
    });
    expect(outputs(await merging("combine", { a: "only" }), "m")).toEqual({ merged: "only" });
  });

  test("first prefers A and list collects what fired", async () => {
    expect(outputs(await merging("first", { a: 1, b: 2 }), "m")).toEqual({ merged: 1 });
    expect(outputs(await merging("list", { a: 1, b: 2 }), "m")).toEqual({ merged: [1, 2] });
    expect(outputs(await merging("list", { a: 1 }), "m")).toEqual({ merged: [1] });
  });
});

describe("logic.filter", () => {
  const items = [
    { name: "a", amount: 3 },
    { name: "b", amount: 10 },
    { name: "c", amount: 7 },
  ];

  test("splits items by a field comparison and fires both handles", async () => {
    const run = await runFlow(
      flow(
        [
          node("t", "trigger.manual"),
          node("f", "logic.filter", { field: "amount", operator: "greater_than", value: "5" }),
        ],
        [edge("t", "run", "f", "items")],
      ),
      { ...options, trigger: { payload: items } },
    );
    expect(run.status).toBe("succeeded");
    expect(outputs(run, "f")).toEqual({ kept: [items[1], items[2]], dropped: [items[0]] });
  });

  test("a blank field tests the items themselves", async () => {
    const run = await runFlow(
      flow(
        [node("t", "trigger.manual"), node("f", "logic.filter", { operator: "is_not_empty" })],
        [edge("t", "run", "f", "items")],
      ),
      { ...options, trigger: { payload: ["x", "", null, "y"] } },
    );
    expect(outputs(run, "f")).toEqual({ kept: ["x", "y"], dropped: ["", null] });
  });

  test("something that is not a list fails the node with a message", async () => {
    const run = await runFlow(
      flow(
        [node("t", "trigger.manual"), node("f", "logic.filter")],
        [edge("t", "run", "f", "items")],
      ),
      { ...options, trigger: { payload: "not a list" } },
    );
    expect(run.status).toBe("failed");
    expect(run.nodes.find((result) => result.nodeId === "f")).toMatchObject({
      status: "failed",
      error: "Filter needs a list of items to filter",
    });
  });
});
