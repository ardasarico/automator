import type { FlowDocument, FlowEdge, FlowNode, FlowNodeType } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { runFlow } from "./engine";

function node(id: string, type: FlowNodeType, config: Record<string, unknown> = {}): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, label: id, config };
}

function edge(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): FlowEdge {
  return { id: `${source}-${target}`, source, sourceHandle, target, targetHandle };
}

function flow(nodes: FlowNode[], edges: FlowEdge[]): FlowDocument {
  return { version: 1, id: "flow-1", name: "Test", description: "", nodes, edges };
}

describe("trigger.api", () => {
  test("carries the caller's input on the Input port", async () => {
    const run = await runFlow(
      flow(
        [
          node("call", "trigger.api"),
          node("keep", "logic.set-variable", { name: "amount", value: "{{input.value.amount}}" }),
        ],
        [edge("call", "input", "keep", "value")],
      ),
      { trigger: { nodeId: "call", payload: { amount: 3 } } },
    );
    expect(run.status).toBe("succeeded");
    expect(run.variables).toEqual({ amount: 3 });
  });
});

describe("logic.return", () => {
  const quote = (outputs: { name: string; value: string }[]) =>
    flow(
      [node("call", "trigger.api"), node("out", "logic.return", { outputs })],
      [edge("call", "input", "out", "value")],
    );

  test("answers the run with its resolved templates", async () => {
    const run = await runFlow(quote([{ name: "price", value: "{{input.value.amount}} USDC" }]), {
      trigger: { nodeId: "call", payload: { amount: 2 } },
    });
    expect(run.status).toBe("succeeded");
    expect(run.output).toEqual({ price: "2 USDC" });
  });

  test("leaves the run without an output when it reaches no Return", async () => {
    const run = await runFlow(flow([node("call", "trigger.api")], []), {
      trigger: { nodeId: "call", payload: {} },
    });
    expect(run.output).toBeUndefined();
  });

  test("keeps the answer of the first Return the run reaches", async () => {
    const run = await runFlow(
      flow(
        [
          node("call", "trigger.api"),
          node("first", "logic.return", { outputs: [{ name: "who", value: "first" }] }),
          node("second", "logic.return", { outputs: [{ name: "who", value: "second" }] }),
        ],
        [edge("call", "input", "first", "value"), edge("first", "output", "second", "value")],
      ),
      { trigger: { nodeId: "call", payload: {} } },
    );
    expect(run.output).toEqual({ who: "first" });
    expect(run.nodes.find((result) => result.nodeId === "second")?.status).toBe("succeeded");
  });

  test("passes its answer on to whatever follows it", async () => {
    const run = await runFlow(
      flow(
        [
          node("call", "trigger.api"),
          node("out", "logic.return", { outputs: [{ name: "price", value: "9" }] }),
          node("after", "logic.set-variable", { name: "echo", value: "{{input.value.price}}" }),
        ],
        [edge("call", "input", "out", "value"), edge("out", "output", "after", "value")],
      ),
      { trigger: { nodeId: "call", payload: {} } },
    );
    expect(run.variables).toEqual({ echo: "9" });
  });

  test("ignores an output row left unnamed", async () => {
    const run = await runFlow(
      quote([
        { name: "", value: "dropped" },
        { name: "ok", value: "kept" },
      ]),
      { trigger: { nodeId: "call", payload: {} } },
    );
    expect(run.output).toEqual({ ok: "kept" });
  });

  test("answers with an empty object when it declares no outputs", async () => {
    const run = await runFlow(quote([]), { trigger: { nodeId: "call", payload: {} } });
    expect(run.output).toEqual({});
  });
});
