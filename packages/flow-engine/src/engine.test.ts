import type { FlowDocument, FlowEdge, FlowNode, FlowNodeType } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { runFlow } from "./engine";
import type { ExecutorRegistry } from "./executor";

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

const fixedNow = () => new Date("2026-09-07T10:00:00.000Z");
const noSleep = async () => {};

function fakeFetch(handler: (url: string, init?: RequestInit) => Response): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) =>
    handler(String(input), init)) as typeof fetch;
}

const okDiscord = fakeFetch(() => Response.json({ id: "m1", channel_id: "c1" }));

describe("runFlow", () => {
  test("an inherited object property is not a fired output handle", async () => {
    const run = await runFlow(
      flow(
        [
          node("t", "trigger.manual"),
          node("after", "logic.set-variable", { name: "ran", value: "yes" }),
        ],
        [edge("t", "toString", "after", "value")],
      ),
    );
    expect(run.nodes[1]?.status).toBe("skipped");
    expect(run.variables).toEqual({});
  });

  test("runs a trigger into a Discord message with templated content", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const run = await runFlow(
      flow(
        [
          node("t", "trigger.manual"),
          node("d", "notify.discord", {
            webhookUrl: "https://discord.com/api/webhooks/1/abc",
            content: "Hello {{input.message.name}}!",
          }),
        ],
        [edge("t", "run", "d", "message")],
      ),
      {
        trigger: { payload: { name: "Ada" } },
        now: fixedNow,
        sleep: noSleep,
        fetch: fakeFetch((url, init) => {
          calls.push({ url, body: JSON.parse(String(init?.body)) });
          return Response.json({ id: "m1", channel_id: "c1" });
        }),
      },
    );
    expect(run.status).toBe("succeeded");
    expect(run.trigger).toEqual({ nodeId: "t", payload: { name: "Ada" } });
    expect(calls).toEqual([
      { url: "https://discord.com/api/webhooks/1/abc?wait=true", body: { content: "Hello Ada!" } },
    ]);
    expect(run.nodes).toEqual([
      {
        nodeId: "t",
        status: "succeeded",
        startedAt: "2026-09-07T10:00:00.000Z",
        finishedAt: "2026-09-07T10:00:00.000Z",
        outputs: { run: { name: "Ada" } },
      },
      {
        nodeId: "d",
        status: "succeeded",
        startedAt: "2026-09-07T10:00:00.000Z",
        finishedAt: "2026-09-07T10:00:00.000Z",
        outputs: { sent: { messageId: "m1", channelId: "c1" } },
      },
    ]);
  });

  test("a condition fires only one branch and skips the other", async () => {
    const run = await runFlow(
      flow(
        [
          node("t", "trigger.manual"),
          node("c", "logic.condition", {
            left: "{{input.value.amount}}",
            operator: "greater_than",
            right: "5",
          }),
          node("yes", "logic.set-variable", { name: "outcome", value: "big" }),
          node("no", "logic.set-variable", { name: "outcome", value: "small" }),
        ],
        [
          edge("t", "run", "c", "value"),
          edge("c", "true", "yes", "value"),
          edge("c", "false", "no", "value"),
        ],
      ),
      { trigger: { payload: { amount: 10 } }, now: fixedNow, sleep: noSleep },
    );
    expect(run.status).toBe("succeeded");
    expect(run.variables).toEqual({ outcome: "big" });
    expect(run.nodes.map((result) => [result.nodeId, result.status])).toEqual([
      ["t", "succeeded"],
      ["c", "succeeded"],
      ["yes", "succeeded"],
      ["no", "skipped"],
    ]);
    expect(run.nodes[1]!.outputs).toEqual({ true: { amount: 10 } });
  });

  test("a failed node stops the run and later nodes are skipped", async () => {
    const run = await runFlow(
      flow(
        [
          node("t", "trigger.manual"),
          node("d", "notify.discord", {
            webhookUrl: "https://discord.com/api/webhooks/1/abc",
            content: "x",
          }),
          node("after", "logic.set-variable", { name: "a", value: "1" }),
        ],
        [edge("t", "run", "d", "message"), edge("d", "sent", "after", "value")],
      ),
      {
        now: fixedNow,
        sleep: noSleep,
        fetch: fakeFetch(() => new Response("nope", { status: 429 })),
      },
    );
    expect(run.status).toBe("failed");
    expect(run.nodes[1]).toMatchObject({ status: "failed", error: "Discord answered 429" });
    expect(run.nodes[2]).toEqual({ nodeId: "after", status: "skipped" });
  });

  test("rejects a Discord webhook URL that is not Discord's", async () => {
    const run = await runFlow(
      flow(
        [
          node("t", "trigger.manual"),
          node("d", "notify.discord", { webhookUrl: "https://evil.example/hook", content: "x" }),
        ],
        [edge("t", "run", "d", "message")],
      ),
      { now: fixedNow, sleep: noSleep, fetch: okDiscord },
    );
    expect(run.nodes[1]).toMatchObject({
      status: "failed",
      error: "Discord message needs a Discord webhook URL",
    });
  });

  test("reports an invalid config as the node's failure", async () => {
    const run = await runFlow(
      flow(
        [node("t", "trigger.manual"), node("w", "logic.wait", { seconds: "later" })],
        [edge("t", "run", "w", "in")],
      ),
      { now: fixedNow, sleep: noSleep },
    );
    expect(run.nodes[1]).toMatchObject({
      status: "failed",
      error: "Invalid node config at /seconds",
    });
  });

  test("stops with waiting at a screen", async () => {
    const run = await runFlow(
      flow(
        [
          node("t", "trigger.miniapp-open"),
          node("s", "screen.page"),
          node("d", "logic.set-variable", { name: "x", value: "1" }),
        ],
        [edge("t", "visitor", "s", "data"), edge("s", "next", "d", "value")],
      ),
      { now: fixedNow, sleep: noSleep },
    );
    expect(run.status).toBe("waiting");
    expect(run.nodes.map((result) => result.status)).toEqual(["succeeded", "waiting", "skipped"]);
  });

  test("fails on a node type without an executor", async () => {
    const executors: ExecutorRegistry = {
      "trigger.manual": { kind: "trigger", run: async ({ trigger }) => ({ run: trigger }) },
    };
    const run = await runFlow(
      flow([node("t", "trigger.manual"), node("a", "logic.wait")], [edge("t", "run", "a", "in")]),
      { executors, now: fixedNow, sleep: noSleep },
    );
    expect(run.status).toBe("failed");
    expect(run.nodes[1]).toMatchObject({
      status: "failed",
      error: 'Node type "logic.wait" is not implemented yet',
    });
  });

  test("a merge runs once one of its inputs fires and waits for both edges to resolve", async () => {
    const seen: Record<string, unknown>[] = [];
    const executors: ExecutorRegistry = {
      "trigger.manual": { kind: "trigger", run: async ({ trigger }) => ({ run: trigger }) },
      "logic.condition": { kind: "step", run: async ({ inputs }) => ({ false: inputs.value }) },
      "logic.merge": {
        kind: "step",
        run: async ({ inputs }) => {
          seen.push(inputs);
          return { merged: inputs };
        },
      },
    };
    const run = await runFlow(
      flow(
        [node("t", "trigger.manual"), node("c", "logic.condition"), node("m", "logic.merge")],
        [edge("t", "run", "c", "value"), edge("c", "true", "m", "a"), edge("c", "false", "m", "b")],
      ),
      { trigger: { payload: 1 }, executors, now: fixedNow, sleep: noSleep },
    );
    expect(run.status).toBe("succeeded");
    expect(seen).toEqual([{ b: 1 }]);
  });

  test("only the requested trigger fires; other triggers and orphan steps are skipped", async () => {
    const run = await runFlow(
      flow(
        [
          node("manual", "trigger.manual"),
          node("hook", "trigger.webhook"),
          node("orphan", "logic.set-variable", { name: "o", value: "1" }),
          node("a", "logic.set-variable", { name: "from", value: "{{input.value}}" }),
        ],
        [edge("manual", "run", "a", "value"), edge("hook", "request", "a", "value")],
      ),
      { trigger: { nodeId: "hook", payload: "webhook" }, now: fixedNow, sleep: noSleep },
    );
    expect(run.status).toBe("succeeded");
    expect(run.trigger.nodeId).toBe("hook");
    expect(run.nodes.map((result) => [result.nodeId, result.status])).toEqual([
      ["manual", "skipped"],
      ["hook", "succeeded"],
      ["orphan", "skipped"],
      ["a", "succeeded"],
    ]);
    expect(run.variables).toEqual({ from: "webhook" });
  });

  test("fails without a trigger, with a bad trigger id, on a bad edge, and on a cycle", async () => {
    const noTrigger = await runFlow(flow([node("a", "logic.wait")], []), { now: fixedNow });
    expect(noTrigger).toMatchObject({
      status: "failed",
      error: "The flow has no trigger to start from",
    });

    const badTrigger = await runFlow(flow([node("t", "trigger.manual")], []), {
      trigger: { nodeId: "zzz" },
      now: fixedNow,
    });
    expect(badTrigger).toMatchObject({ status: "failed", error: 'Node "zzz" is not a trigger' });

    const badEdge = await runFlow(
      flow([node("t", "trigger.manual")], [edge("t", "run", "ghost", "in")]),
      { now: fixedNow },
    );
    expect(badEdge).toMatchObject({
      status: "failed",
      error: 'Edge "t-ghost" points at a missing node',
    });

    const cycle = await runFlow(
      flow(
        [
          node("t", "trigger.manual"),
          node("a", "logic.set-variable", { name: "a", value: "1" }),
          node("b", "logic.set-variable", { name: "b", value: "2" }),
        ],
        [
          edge("t", "run", "a", "value"),
          edge("a", "value", "b", "value"),
          edge("b", "value", "a", "value"),
        ],
      ),
      { now: fixedNow, sleep: noSleep },
    );
    expect(cycle).toMatchObject({ status: "failed", error: "The flow contains a cycle" });
  });

  test("wait sleeps for the configured seconds and passes its input on", async () => {
    const slept: number[] = [];
    const run = await runFlow(
      flow(
        [node("t", "trigger.manual"), node("w", "logic.wait", { seconds: 2 })],
        [edge("t", "run", "w", "in")],
      ),
      {
        trigger: { payload: "p" },
        now: fixedNow,
        sleep: async (ms) => {
          slept.push(ms);
        },
      },
    );
    expect(slept).toEqual([2000]);
    expect(run.nodes[1]!.outputs).toEqual({ done: "p" });
  });

  test("rejects a cycle before running an otherwise reachable external side effect", async () => {
    const fetched: string[] = [];
    const run = await runFlow(
      flow(
        [
          node("t", "trigger.manual"),
          node("d", "notify.discord", {
            webhookUrl: "https://discord.com/api/webhooks/1/abc",
            content: "must not be sent",
          }),
          node("a", "logic.wait"),
          node("b", "logic.wait"),
        ],
        [
          edge("t", "run", "d", "message"),
          edge("d", "sent", "a", "in"),
          edge("a", "done", "b", "in"),
          edge("b", "done", "a", "in"),
        ],
      ),
      {
        fetch: fakeFetch((url) => {
          fetched.push(url);
          return Response.json({ id: "m", channel_id: "c" });
        }),
      },
    );
    expect(run).toMatchObject({ status: "failed", error: "The flow contains a cycle" });
    expect(fetched).toEqual([]);
    expect(run.nodes.every((result) => result.status === "skipped")).toBe(true);
  });
});

describe("runFlow resume", () => {
  const checkout = flow(
    [
      node("t", "trigger.miniapp-open"),
      node("form", "screen.form"),
      node("d", "notify.discord", {
        webhookUrl: "https://discord.com/api/webhooks/1/abc",
        content: "New signup: {{input.message.email}} ({{trigger.openedAt}})",
      }),
      node("done", "screen.page"),
    ],
    [
      edge("t", "visitor", "form", "data"),
      edge("form", "submitted", "d", "message"),
      edge("d", "sent", "done", "data"),
    ],
  );

  test("a first run stops waiting at the screen", async () => {
    const run = await runFlow(checkout, {
      trigger: { nodeId: "t", payload: { openedAt: "now" } },
      now: fixedNow,
      sleep: noSleep,
      fetch: okDiscord,
    });
    expect(run.status).toBe("waiting");
    expect(run.nodes.map((result) => [result.nodeId, result.status])).toEqual([
      ["t", "succeeded"],
      ["form", "waiting"],
      ["d", "skipped"],
      ["done", "skipped"],
    ]);
  });

  test("resuming from the screen feeds its outputs downstream and reaches the next screen", async () => {
    const calls: unknown[] = [];
    const seen: string[] = [];
    const run = await runFlow(checkout, {
      trigger: { payload: { openedAt: "now" } },
      resume: {
        nodeId: "form",
        outputs: { submitted: { email: "ada@example.com" } },
        variables: { fromBefore: 1 },
      },
      onNodeResult: (result) => seen.push(`${result.nodeId}:${result.status}`),
      now: fixedNow,
      sleep: noSleep,
      fetch: fakeFetch((_url, init) => {
        calls.push(JSON.parse(String(init?.body)));
        return Response.json({ id: "m1", channel_id: "c1" });
      }),
    });
    expect(run.status).toBe("waiting");
    expect(run.trigger).toEqual({ nodeId: null, payload: { openedAt: "now" } });
    expect(run.variables).toEqual({ fromBefore: 1 });
    expect(calls).toEqual([{ content: "New signup: ada@example.com (now)" }]);
    expect(run.nodes.map((result) => [result.nodeId, result.status])).toEqual([
      ["t", "skipped"],
      ["form", "succeeded"],
      ["d", "succeeded"],
      ["done", "waiting"],
    ]);
    expect(run.nodes[1]!.outputs).toEqual({ submitted: { email: "ada@example.com" } });
    expect(seen).toEqual(["t:skipped", "form:succeeded", "d:succeeded", "done:waiting"]);
  });

  test("resuming on an unwired port ends the run as succeeded with the rest skipped", async () => {
    const run = await runFlow(checkout, {
      resume: { nodeId: "done", outputs: { next: true } },
      now: fixedNow,
      sleep: noSleep,
    });
    expect(run.status).toBe("succeeded");
    expect(run.nodes.map((result) => result.status)).toEqual([
      "skipped",
      "skipped",
      "skipped",
      "succeeded",
    ]);
  });

  test("refuses to resume from a node that is not a screen", async () => {
    const run = await runFlow(checkout, {
      resume: { nodeId: "d", outputs: {} },
      now: fixedNow,
      sleep: noSleep,
    });
    expect(run.status).toBe("failed");
    expect(run.error).toBe('Node "d" is not a screen to resume from');
  });

  test("resuming with an error fails the screen itself and skips the rest", async () => {
    const seen: string[] = [];
    const run = await runFlow(checkout, {
      resume: { nodeId: "form", outputs: {}, error: "Sign-in is not configured" },
      onNodeResult: (result) => seen.push(`${result.nodeId}:${result.status}`),
      now: fixedNow,
      sleep: noSleep,
      fetch: okDiscord,
    });
    expect(run.status).toBe("failed");
    expect(run.nodes[1]).toMatchObject({
      nodeId: "form",
      status: "failed",
      error: "Sign-in is not configured",
    });
    expect(run.nodes.map((result) => result.status)).toEqual([
      "skipped",
      "failed",
      "skipped",
      "skipped",
    ]);
    expect(seen).toEqual(["t:skipped", "form:failed", "d:skipped", "done:skipped"]);
  });

  test("identity screens pause like any other screen and resume on their port", async () => {
    const gated = flow(
      [
        node("t", "trigger.miniapp-open"),
        node("login", "privy.login"),
        node("verify", "world.id-verify", { action: "claim" }),
        node("d", "notify.discord", {
          webhookUrl: "https://discord.com/api/webhooks/1/abc",
          content: "{{input.message.nullifierHash}} for {{vars.visitor.email}}",
        }),
        node("no", "screen.page"),
      ],
      [
        edge("t", "visitor", "login", "visitor"),
        edge("login", "user", "verify", "visitor"),
        edge("verify", "verified", "d", "message"),
        edge("verify", "rejected", "no", "data"),
      ],
    );
    const first = await runFlow(gated, { trigger: { nodeId: "t" }, now: fixedNow });
    expect(first.status).toBe("waiting");
    expect(first.nodes[1]!.status).toBe("waiting");

    const calls: unknown[] = [];
    const verified = await runFlow(gated, {
      resume: {
        nodeId: "verify",
        outputs: {
          verified: { nullifierHash: "0xabc", verificationLevel: "orb", action: "claim" },
        },
        variables: { visitor: { email: "ada@example.com" } },
      },
      now: fixedNow,
      fetch: fakeFetch((_url, init) => {
        calls.push(JSON.parse(String(init?.body)));
        return Response.json({ id: "m1", channel_id: "c1" });
      }),
    });
    expect(verified.status).toBe("succeeded");
    expect(calls).toEqual([{ content: "0xabc for ada@example.com" }]);
    expect(verified.nodes.map((result) => result.status)).toEqual([
      "skipped",
      "skipped",
      "succeeded",
      "succeeded",
      "skipped",
    ]);

    const rejected = await runFlow(gated, {
      resume: { nodeId: "verify", outputs: { rejected: { code: "invalid_proof", detail: "" } } },
      now: fixedNow,
    });
    expect(rejected.status).toBe("waiting");
    expect(rejected.nodes[4]!.status).toBe("waiting");
  });
});

describe("runFlow with screens: auto", () => {
  const signup = flow(
    [
      node("t", "trigger.miniapp-open"),
      node("form", "screen.form", {
        fields: [{ id: "email", label: "Email", type: "email" }],
      }),
      node("ask", "screen.confirmation", { simulate: "cancelled" }),
      node("d", "notify.discord", {
        webhookUrl: "https://discord.com/api/webhooks/1/abc",
        content: "{{input.message.email}}",
      }),
      node("bye", "screen.page"),
    ],
    [
      edge("t", "visitor", "form", "data"),
      edge("form", "submitted", "ask", "data"),
      edge("ask", "confirmed", "d", "message"),
      edge("ask", "cancelled", "bye", "data"),
    ],
  );

  test("answers every screen and runs to the end", async () => {
    const run = await runFlow(signup, {
      screens: "auto",
      trigger: { payload: {} },
      now: fixedNow,
      sleep: noSleep,
      fetch: okDiscord,
    });
    expect(run.status).toBe("succeeded");
    expect(run.nodes.map((result) => [result.nodeId, result.status])).toEqual([
      ["t", "succeeded"],
      ["form", "succeeded"],
      ["ask", "succeeded"],
      ["d", "skipped"],
      ["bye", "succeeded"],
    ]);
    expect(run.nodes[1]!.outputs).toEqual({
      submitted: { email: "visitor@example.com" },
      simulated: { port: "submitted" },
    });
    expect(run.nodes[2]!.outputs).toEqual({
      cancelled: { action: "cancelled" },
      simulated: { port: "cancelled" },
    });
  });

  test("still waits by default", async () => {
    const run = await runFlow(signup, { trigger: { payload: {} }, now: fixedNow, sleep: noSleep });
    expect(run.status).toBe("waiting");
    expect(run.nodes[1]).toEqual({ nodeId: "form", status: "waiting" });
  });
});

describe("template robustness", () => {
  test("a Discord content template that resolves to nothing fails as empty, not as a crash", async () => {
    const run = await runFlow(
      flow(
        [
          node("t", "trigger.manual"),
          node("d", "notify.discord", {
            webhookUrl: "https://discord.com/api/webhooks/1/abc",
            content: "{{input.result}}",
          }),
        ],
        [edge("t", "run", "d", "message")],
      ),
      { now: fixedNow, sleep: noSleep, fetch: okDiscord },
    );
    expect(run.nodes[1]).toMatchObject({
      status: "failed",
      error: "Discord message content is empty",
    });
  });

  test("an object delivered to Discord content is posted as JSON text", async () => {
    const bodies: unknown[] = [];
    const run = await runFlow(
      flow(
        [
          node("t", "trigger.manual"),
          node("d", "notify.discord", {
            webhookUrl: "https://discord.com/api/webhooks/1/abc",
            content: "{{input.message}}",
          }),
        ],
        [edge("t", "run", "d", "message")],
      ),
      {
        trigger: { payload: { amount: 3 } },
        now: fixedNow,
        sleep: noSleep,
        fetch: fakeFetch((_url, init) => {
          bodies.push(JSON.parse(String(init?.body)));
          return Response.json({ id: "m", channel_id: "c" });
        }),
      },
    );
    expect(run.status).toBe("succeeded");
    expect(bodies).toEqual([{ content: '{"amount":3}' }]);
  });
});

describe("runFlow secrets", () => {
  const hook = flow(
    [
      node("t", "trigger.manual"),
      node("d", "notify.discord", { webhookUrl: "{{secrets.hook}}", content: "hi" }),
    ],
    [edge("t", "run", "d", "message")],
  );

  test("resolves {{secrets.*}} through the resolver right before the node runs", async () => {
    const urls: string[] = [];
    const run = await runFlow(hook, {
      now: fixedNow,
      sleep: noSleep,
      secrets: { get: async () => ({ hook: "https://discord.com/api/webhooks/9/zzz" }) },
      fetch: fakeFetch((url) => {
        urls.push(url);
        return Response.json({ id: "m1", channel_id: "c1" });
      }),
    });
    expect(run.status).toBe("succeeded");
    expect(urls).toEqual(["https://discord.com/api/webhooks/9/zzz?wait=true"]);
  });

  test("fails the node when a referenced secret is not defined", async () => {
    const run = await runFlow(hook, {
      now: fixedNow,
      sleep: noSleep,
      secrets: { get: async () => ({}) },
      fetch: okDiscord,
    });
    expect(run.status).toBe("failed");
    expect(run.nodes[1]).toMatchObject({ status: "failed", error: 'Secret "hook" is not defined' });
  });

  test("leaves the placeholder literal without a resolver", async () => {
    const run = await runFlow(hook, { now: fixedNow, sleep: noSleep, fetch: okDiscord });
    expect(run.nodes[1]).toMatchObject({
      status: "failed",
      error: "Discord message needs a Discord webhook URL",
    });
  });
});
