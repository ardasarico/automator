import type { FlowDocument, FlowEdge, FlowNode, FlowRunNodeResult } from "@automator/contracts";
import { expect, test } from "bun:test";
import { runFlow } from "./engine";

const node = (id: string, type: FlowNode["type"], config: FlowNode["config"] = {}): FlowNode => ({
  id,
  type,
  label: id,
  config,
  position: { x: 0, y: 0 },
});
const edge = (
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): FlowEdge => ({
  id: `${source}-${target}`,
  source,
  sourceHandle,
  target,
  targetHandle,
});
const flow = (nodes: FlowNode[], edges: FlowEdge[]): FlowDocument => ({
  version: 1,
  id: "nonlinear",
  name: "Nonlinear",
  description: "",
  nodes,
  edges,
});

// One branch sends once, the other pauses twice; the final join needs both branches.
const pausedJoin = flow(
  [
    node("start", "trigger.miniapp-open"),
    node("send", "notify.discord", {
      webhookUrl: "https://discord.com/api/webhooks/1/qa",
      content: "QA",
    }),
    node("first", "screen.page"),
    node("second", "screen.confirmation"),
    node("join", "logic.merge", { mode: "list" }),
  ],
  [
    edge("start", "visitor", "send", "message"),
    edge("start", "visitor", "first", "data"),
    edge("first", "next", "second", "data"),
    edge("send", "sent", "join", "a"),
    edge("second", "confirmed", "join", "b"),
  ],
);

test.each([false, true])(
  "resuming a fan-in preserves completed outputs without repeating delivery (screen first=%s)",
  async (screenFirst) => {
    const document = structuredClone(pausedJoin);
    if (screenFirst) document.edges.reverse();
    let deliveries = 0;
    const fetcher = (async () => {
      deliveries++;
      return Response.json({ id: "message", channel_id: "channel" });
    }) as unknown as typeof fetch;
    const initial = await runFlow(document, { fetch: fetcher });
    expect(initial.status).toBe("waiting");
    const second = await runFlow(document, {
      fetch: fetcher,
      resume: {
        nodeId: "first",
        outputs: { next: true },
        variables: initial.variables,
        completed: initial.nodes,
      },
    });
    expect(second.status).toBe("waiting");
    const emitted: FlowRunNodeResult[] = [];
    const final = await runFlow(document, {
      fetch: fetcher,
      resume: {
        nodeId: "second",
        outputs: { confirmed: "yes" },
        variables: second.variables,
        completed: second.nodes,
      },
      onNodeResult: (result) => emitted.push(result),
    });
    expect(final.status).toBe("succeeded");
    expect(deliveries).toBe(1);
    expect(final.nodes.find((n) => n.nodeId === "join")?.outputs).toEqual({
      merged: [{ messageId: "message", channelId: "channel" }, "yes"],
    });
    expect(emitted.some((n) => n.nodeId === "send" && n.status === "succeeded")).toBe(false);
  },
);

function loopJoin(items: string) {
  return flow(
    [
      node("start", "trigger.manual"),
      node("loop", "logic.for-each", { items }),
      node("body", "logic.set-variable", { name: "last", value: "{{input.value}}" }),
      node("join", "logic.merge", { mode: "list" }),
      node("page", "screen.page"),
    ],
    [
      edge("start", "run", "loop", "items"),
      edge("loop", "item", "body", "value"),
      edge("body", "value", "join", "a"),
      edge("loop", "done", "join", "b"),
      edge("join", "merged", "page", "data"),
    ],
  );
}

test.each(["[1,2]", "[]"])(
  "Item and Done join once after the loop (%s), before the screen",
  async (items) => {
    const seen: string[] = [];
    const run = await runFlow(loopJoin(items), {
      onNodeResult: (n) => {
        if (n.status === "succeeded") seen.push(n.nodeId);
      },
    });
    expect(run.status).toBe("waiting");
    const values = JSON.parse(items) as number[];
    const summary = {
      items: values,
      results: values.map((value) => ({ value })),
      count: values.length,
    };
    expect(run.nodes.find((n) => n.nodeId === "join")?.outputs).toEqual({
      merged: values.length ? [2, summary] : [summary],
    });
    expect(seen.filter((id) => id === "join")).toHaveLength(1);
    expect(seen.indexOf("join")).toBeGreaterThan(seen.indexOf("loop"));
  },
);

test("a loop reached after a screen still executes every item, then its shared join", async () => {
  const document = loopJoin("[1,2]");
  document.nodes.push(node("before", "screen.page"));
  document.edges[0] = edge("start", "run", "before", "data");
  document.edges.push(edge("before", "next", "loop", "items"));
  const initial = await runFlow(document);
  const resumed = await runFlow(document, {
    resume: {
      nodeId: "before",
      outputs: { next: true },
      completed: initial.nodes,
      variables: initial.variables,
    },
  });
  expect(resumed.status).toBe("waiting");
  expect(resumed.variables.last).toBe(2);
  expect(resumed.nodes.find((n) => n.nodeId === "join")?.outputs).toEqual({
    merged: [2, { items: [1, 2], results: [{ value: 1 }, { value: 2 }], count: 2 }],
  });
});

test("nested loops keep the inner Done join inside the outer body", async () => {
  const document = loopJoin("[1,2]");
  document.nodes.push(
    node("inner", "logic.for-each", { items: "[3,4]" }),
    node("inner join", "logic.merge", { mode: "list" }),
  );
  document.edges = [
    edge("start", "run", "loop", "items"),
    edge("loop", "item", "inner", "items"),
    edge("inner", "item", "body", "value"),
    edge("body", "value", "inner join", "a"),
    edge("inner", "done", "inner join", "b"),
    edge("inner join", "merged", "join", "a"),
    edge("loop", "done", "join", "b"),
    edge("join", "merged", "page", "data"),
  ];
  const run = await runFlow(document);
  expect(run.status).toBe("waiting");
  const inner = [4, { items: [3, 4], results: [{ value: 3 }, { value: 4 }], count: 2 }];
  expect(run.nodes.find((n) => n.nodeId === "join")?.outputs).toEqual({
    merged: [inner, { items: [1, 2], results: [{ merged: inner }, { merged: inner }], count: 2 }],
  });
});

test.each(["[1,2]", "[]"])(
  "rejects outside inputs to an Item body before any delivery (%s)",
  async (items) => {
    const document = flow(
      [
        node("start", "trigger.manual"),
        node("external", "logic.set-variable", { name: "shared", value: "outside" }),
        node("loop", "logic.for-each", { items }),
        node("merge", "logic.merge", { mode: "list" }),
        node("send", "notify.discord", {
          webhookUrl: "https://discord.com/api/webhooks/1/qa",
          content: "QA",
        }),
      ],
      [
        edge("start", "run", "external", "value"),
        edge("external", "value", "loop", "items"),
        edge("external", "value", "merge", "a"),
        edge("loop", "item", "merge", "b"),
        edge("merge", "merged", "send", "message"),
      ],
    );
    let deliveries = 0;
    const run = await runFlow(document, {
      fetch: (async () => {
        deliveries += 1;
        return Response.json({ id: "message" });
      }) as unknown as typeof fetch,
    });
    expect(run.status).toBe("failed");
    expect(run.error).toContain("inputs from outside");
    expect(run.nodes.every((result) => result.status === "skipped")).toBe(true);
    expect(deliveries).toBe(0);
  },
);
