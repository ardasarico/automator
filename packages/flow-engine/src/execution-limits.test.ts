import { expect, test } from "bun:test";
import type { FlowDocument, FlowNode, FlowNodeType } from "@automator/contracts";
import { runFlow } from "./engine";
import { scriptedModel } from "./language-model";
import { findFunction, parseAbiText } from "./abi";

const node = (id: string, type: FlowNodeType, config = {}): FlowNode => ({
  id,
  type,
  config,
  label: id,
  position: { x: 0, y: 0 },
});
const flow = (nodes: FlowNode[], links: [string, string, string][]): FlowDocument => ({
  version: 1,
  id: "limits",
  name: "Limits",
  description: "",
  nodes,
  edges: links.map(([source, sourceHandle, target], i) => ({
    id: String(i),
    source,
    sourceHandle,
    target,
  })),
});

test("canonical signatures resolve same-arity and tuple-array overloads exactly", () => {
  const abi = parseAbiText(
    "function read(address value) view returns (uint256)\nfunction read(uint256 value) view returns (uint256)\nfunction read((uint256,address)[] value) view returns (uint256)",
  );
  expect(findFunction(abi, "read(uint256)", 1).inputs[0]?.type).toBe("uint256");
  expect(findFunction(abi, "read((uint256,address)[])", 1).inputs[0]?.type).toBe("tuple[]");
  expect(() => findFunction(abi, "read", 1)).toThrow("more than one overload");
  expect(() => findFunction(abi, "read(bytes32)", 1)).toThrow("no function");
});

test("nested loops share one node budget and retain completed effects", async () => {
  let calls = 0;
  const run = await runFlow(
    flow(
      [
        node("t", "trigger.manual"),
        node("outer", "logic.for-each", { items: "[1,2,3]" }),
        node("inner", "logic.for-each", { items: "[1,2,3]" }),
        node("effect", "logic.set-variable"),
        node("after", "logic.set-variable"),
      ],
      [
        ["t", "run", "outer"],
        ["outer", "item", "inner"],
        ["inner", "item", "effect"],
        ["outer", "done", "after"],
      ],
    ),
    {
      maxNodeExecutions: 7,
      executors: {
        "trigger.manual": { kind: "trigger", run: async () => ({ run: true }) },
        "logic.set-variable": {
          kind: "step",
          run: async ({ variables }) => {
            calls += 1;
            variables.calls = calls;
            return { value: calls };
          },
        },
      },
    },
  );
  expect(run.status).toBe("failed");
  expect(calls).toBe(3);
  expect(run.variables.calls).toBe(3);
  expect(run.nodes.find((n) => n.nodeId === "outer")?.error).toContain("7 node executions");
  expect(run.nodes.find((n) => n.nodeId === "after")?.status).toBe("skipped");
});

const agentFlow = () =>
  flow(
    [
      node("t", "trigger.manual"),
      node("a", "ai.agent", {
        task: "Fetch",
        tools: ["http_get"],
        allowedHosts: ["example.com"],
      }),
    ],
    [["t", "run", "a"]],
  );
const httpCall = { id: "get", name: "http_get", arguments: { url: "https://example.com" } };

test("agent bounds streamed HTTP response consumption and cancels the remainder", async () => {
  let cancelled = false;
  let pulls = 0;
  const { model } = scriptedModel([
    { content: null, toolCalls: [httpCall] },
    { content: "ok", toolCalls: [] },
  ]);
  const run = await runFlow(agentFlow(), {
    model,
    fetch: (async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            pulls += 1;
            controller.enqueue(new TextEncoder().encode("a".repeat(2000)));
          },
          cancel() {
            cancelled = true;
          },
        }),
      )) as unknown as typeof fetch,
  });
  expect(run.status).toBe("succeeded");
  expect(cancelled).toBe(true);
  expect(pulls).toBeLessThanOrEqual(3);
  expect(((run.nodes[1]?.outputs?.steps ?? []) as { result: string }[])[0]?.result).toBe(
    `HTTP 200\n${"a".repeat(4000)}`,
  );
});

test("agent refuses an oversized tool batch before any effects", async () => {
  let calls = 0;
  const { model } = scriptedModel([
    {
      content: null,
      toolCalls: Array.from({ length: 101 }, (_, i) => ({ ...httpCall, id: String(i) })),
    },
  ]);
  const run = await runFlow(agentFlow(), {
    model,
    fetch: (async () => {
      calls += 1;
      return new Response("ok");
    }) as unknown as typeof fetch,
  });
  expect(run.nodes[1]?.error).toContain("100 tool calls");
  expect(calls).toBe(0);
});

test("aborting an agent cancels a pending response body", async () => {
  const controller = new AbortController();
  let cancelled = false;
  const { model } = scriptedModel([{ content: null, toolCalls: [httpCall] }]);
  const run = await runFlow(agentFlow(), {
    model,
    signal: controller.signal,
    fetch: (async () =>
      new Response(
        new ReadableStream({
          pull() {
            queueMicrotask(() => controller.abort());
          },
          cancel() {
            cancelled = true;
          },
        }),
      )) as unknown as typeof fetch,
  });
  expect(run.status).toBe("failed");
  expect(run.error).toContain("cancelled");
  expect(cancelled).toBe(true);
});

test("agent cumulative tool budget retains earlier effects when a later batch exceeds it", async () => {
  let calls = 0;
  const { model } = scriptedModel([
    {
      content: null,
      toolCalls: Array.from({ length: 100 }, (_, i) => ({ ...httpCall, id: String(i) })),
    },
    { content: null, toolCalls: [httpCall] },
  ]);
  const run = await runFlow(agentFlow(), {
    model,
    fetch: (async () => {
      calls += 1;
      return new Response("ok");
    }) as unknown as typeof fetch,
  });
  expect(run.status).toBe("failed");
  expect(calls).toBe(100);
  expect(run.nodes[1]?.outputs?.steps).toHaveLength(100);
  expect(run.nodes[1]?.error).toContain("100 tool calls");
});
