import { describe, expect, test } from "bun:test";
import type { FlowDocument } from "@automator/contracts";
import { Elysia } from "elysia";
import { memoryStores } from "../runs/test-stores";
import { createHookRoutes, createRateLimiter } from "./routes";

const hooked: FlowDocument = {
  version: 1,
  id: "flow-1",
  name: "Hooked",
  description: "",
  nodes: [
    { id: "w", type: "trigger.webhook", position: { x: 0, y: 0 }, label: "Hook", config: {} },
    {
      id: "v",
      type: "logic.set-variable",
      position: { x: 300, y: 0 },
      label: "Remember",
      config: { name: "seen", value: "{{input.value.body.hello}}" },
    },
  ],
  edges: [{ id: "e", source: "w", sourceHandle: "request", target: "v", targetHandle: "value" }],
};
const unhooked: FlowDocument = {
  ...hooked,
  id: "flow-2",
  nodes: [hooked.nodes[1]!, { ...hooked.nodes[0]!, type: "trigger.manual" }],
  edges: [],
};

function fixture(callsPerMinute = 60) {
  let clock = 1_757_200_000_000;
  const stores = memoryStores([
    { ownerId: "did:privy:alice", flow: hooked, enabled: true },
    { ownerId: "did:privy:alice", flow: unhooked, enabled: true },
    { ownerId: "did:privy:bob", flow: { ...hooked, id: "flow-3" }, enabled: false },
  ]);
  const app = new Elysia().use(
    createHookRoutes({
      ...stores,
      callsPerMinute,
      now: () => clock,
      engine: { sleep: async () => {} },
    }),
  );
  const call = (path: string, init: RequestInit = {}) =>
    app.handle(new Request(`http://localhost${path}`, { method: "POST", ...init }));
  return { call, stores, advance: (ms: number) => (clock += ms) };
}

describe("POST /hooks/:flowId/:token", () => {
  test("runs the enabled flow from its webhook trigger with the request as payload", async () => {
    const { call, stores } = fixture();
    const response = await call("/hooks/flow-1/token-flow-1?source=test", {
      headers: { "content-type": "application/json", "x-demo": "1" },
      body: JSON.stringify({ hello: "world" }),
    });
    expect(response.status).toBe(202);
    const body = (await response.json()) as { runId: string; status: string };
    expect(body.status).toBe("succeeded");
    const stored = stores.runRecords[0]!;
    expect(stored.run.id).toBe(body.runId);
    expect(stored.source).toBe("webhook");
    expect(stored.ownerId).toBe("did:privy:alice");
    expect(stored.run.trigger.nodeId).toBe("w");
    expect(stored.run.trigger.payload).toMatchObject({
      method: "POST",
      query: { source: "test" },
      body: { hello: "world" },
      headers: { "x-demo": "1" },
    });
    expect(stored.run.variables).toEqual({ seen: "world" });
  });

  test("a non-JSON body arrives as text and an empty one as null", async () => {
    const { call, stores } = fixture();
    await call("/hooks/flow-1/token-flow-1", { body: "plain text" });
    await call("/hooks/flow-1/token-flow-1");
    expect(stores.runRecords.map((r) => (r.run.trigger.payload as { body: unknown }).body)).toEqual(
      ["plain text", null],
    );
  });

  test.each([
    ["a wrong token", "/hooks/flow-1/nope"],
    ["an unknown flow", "/hooks/flow-9/token-flow-9"],
    ["a disabled flow", "/hooks/flow-3/token-flow-3"],
    ["a flow without a webhook trigger", "/hooks/flow-2/token-flow-2"],
  ])("%s is not found and stores nothing", async (_name, path) => {
    const { call, stores } = fixture();
    const response = await call(path, { body: "{}" });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
    expect(stores.runRecords).toHaveLength(0);
  });

  test("calls beyond the per-flow limit answer 429 until the window moves on", async () => {
    const { call, advance, stores } = fixture(2);
    expect((await call("/hooks/flow-1/token-flow-1")).status).toBe(202);
    expect((await call("/hooks/flow-1/token-flow-1")).status).toBe(202);
    const limited = await call("/hooks/flow-1/token-flow-1");
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "rate_limited" });
    expect(stores.runRecords).toHaveLength(2);
    advance(61_000);
    expect((await call("/hooks/flow-1/token-flow-1")).status).toBe(202);
  });
});

test("the rate limiter keys per flow", () => {
  let clock = 0;
  const limiter = createRateLimiter(1, () => clock);
  expect(limiter.allow("a")).toBe(true);
  expect(limiter.allow("a")).toBe(false);
  expect(limiter.allow("b")).toBe(true);
  clock = 60_001;
  expect(limiter.allow("a")).toBe(true);
});
