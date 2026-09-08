import { describe, expect, test } from "bun:test";
import {
  getRunContract,
  listAllRunsContract,
  parseResponse,
  runFlowContract,
  type FlowDocument,
  type FlowRunRecord,
} from "@automator/contracts";
import { Elysia } from "elysia";
import type { IdentityProvider } from "../auth/privy";
import { createRunRoutes } from "./routes";
import { memoryStores } from "./test-stores";

const identity: IdentityProvider = {
  verify: async (token) =>
    token === "alice"
      ? { id: "did:privy:alice", expiresAt: 2e9 }
      : token === "carol"
        ? { id: "did:privy:carol", expiresAt: 2e9 }
        : null,
  walletAddress: async () => null,
};

const document: FlowDocument = {
  version: 1,
  id: "flow-1",
  name: "Ping",
  description: "",
  nodes: [
    { id: "t", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Run", config: {} },
    {
      id: "d",
      type: "notify.discord",
      position: { x: 300, y: 0 },
      label: "Discord",
      config: {
        webhookUrl: "https://discord.com/api/webhooks/1/abc",
        content: "{{input.message}}",
      },
    },
  ],
  edges: [{ id: "e", source: "t", sourceHandle: "run", target: "d", targetHandle: "message" }],
};

function fixture(persisted = false, callsPerMinute?: number) {
  const posted: unknown[] = [];
  const persistence = persisted
    ? memoryStores([{ ownerId: "did:privy:alice", flow: document }])
    : undefined;
  let clock = 1_757_200_000_000;
  const app = new Elysia().use(
    createRunRoutes({
      identity,
      flows: persistence?.flows,
      runs: persistence?.runs,
      callsPerMinute,
      now: () => clock,
      engine: {
        sleep: async () => {},
        fetch: (async (_url: string | URL | Request, init?: RequestInit) => {
          posted.push(JSON.parse(String(init?.body)));
          return Response.json({ id: "m1", channel_id: "c1" });
        }) as typeof fetch,
      },
    }),
  );
  const post = (body: unknown, token?: string, signal?: AbortSignal) =>
    app.handle(
      new Request(`http://localhost${runFlowContract.path}`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal,
      }),
    );
  const call = (
    path: string,
    method: string,
    body?: unknown,
    token = "alice",
    signal?: AbortSignal,
  ) =>
    app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal,
      }),
    );
  return {
    post,
    posted,
    call,
    runRecords: persistence?.runRecords ?? [],
    advance: (ms: number) => (clock += ms),
  };
}

describe("POST /flows/run", () => {
  test("a cancelled request never starts an external action", async () => {
    const { post, posted } = fixture();
    const response = await post({ document }, "alice", AbortSignal.abort());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "failed",
      error: "The run was cancelled.",
    });
    expect(posted).toEqual([]);
  });
  test("requires a valid token", async () => {
    const { post, posted } = fixture();
    expect((await post({ document })).status).toBe(401);
    expect((await post({ document }, "mallory")).status).toBe(401);
    expect(posted).toEqual([]);
  });

  test("runs beyond the per-user limit answer 429 across both run routes", async () => {
    const { post, call, runRecords, advance } = fixture(true, 2);
    expect((await post({ document }, "alice")).status).toBe(200);
    expect((await call("/flows/flow-1/runs", "POST", {})).status).toBe(201);
    const limited = await call("/flows/flow-1/runs", "POST", {});
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    expect(await limited.json()).toEqual({ error: "rate_limited" });
    expect((await post({ document }, "alice")).status).toBe(429);
    expect(runRecords).toHaveLength(1);
    // Another user has a window of their own, and reads are never limited.
    expect((await post({ document }, "carol")).status).toBe(200);
    expect((await call("/runs", "GET")).status).toBe(200);
    advance(61_000);
    expect((await post({ document }, "alice")).status).toBe(200);
  });

  test("answers screens itself when the body asks for screens: auto", async () => {
    const { post, posted } = fixture();
    const withScreen: FlowDocument = {
      ...document,
      nodes: [
        document.nodes[0]!,
        { id: "s", type: "screen.page", position: { x: 0, y: 0 }, label: "Hi", config: {} },
        {
          ...document.nodes[1]!,
          config: { ...document.nodes[1]!.config, content: "Took {{input.message.action}}" },
        },
      ],
      edges: [
        { id: "e1", source: "t", sourceHandle: "run", target: "s", targetHandle: "data" },
        { id: "e2", source: "s", sourceHandle: "next", target: "d", targetHandle: "message" },
      ],
    };
    const waiting = await post({ document: withScreen }, "alice");
    expect(((await waiting.json()) as { status: string }).status).toBe("waiting");
    const response = await post({ document: withScreen, screens: "auto" }, "alice");
    const result = parseResponse(runFlowContract, response.status, await response.json());
    if (result.status !== 200) throw new Error("expected a run");
    expect(result.data.status).toBe("succeeded");
    expect(result.data.nodes[1]!.outputs).toEqual({
      next: { action: "next" },
      simulated: { port: "next" },
    });
    expect(posted).toEqual([{ content: "Took next" }]);
  });

  test("runs the document and answers with a contract-valid run", async () => {
    const { post, posted } = fixture();
    const response = await post({ document, trigger: { payload: "hello" } }, "alice");
    expect(response.status).toBe(200);
    const result = parseResponse(runFlowContract, response.status, await response.json());
    if (result.status !== 200) throw new Error("expected a run");
    expect(result.data.status).toBe("succeeded");
    expect(result.data.flowId).toBe("flow-1");
    expect(result.data.nodes.map((node) => node.status)).toEqual(["succeeded", "succeeded"]);
    expect(posted).toEqual([{ content: "hello" }]);
  });

  test("answers 400 for a body that is not a flow document, and 401 first when anonymous", async () => {
    const { post } = fixture();
    const response = await post({ document: { nodes: "no" } }, "alice");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect((await post({ document: { nodes: "no" } })).status).toBe(401);
  });
});

describe("persisted runs", () => {
  test("a cancelled saved run records cancellation without executing external actions", async () => {
    const { call, posted, runRecords } = fixture(true);
    const response = await call("/flows/flow-1/runs", "POST", {}, "alice", AbortSignal.abort());
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      run: { status: "failed", error: "The run was cancelled." },
    });
    expect(posted).toEqual([]);
    expect(runRecords).toHaveLength(1);
    expect(runRecords[0]?.run.status).toBe("failed");
  });
  test("the persisted routes are absent without stores", async () => {
    const { call } = fixture();
    expect((await call("/flows/flow-1/runs", "POST", {})).status).toBe(404);
    expect((await call("/runs", "GET")).status).toBe(404);
  });

  test("runs the saved flow, stores the run, then lists and reads it back", async () => {
    const { call, posted, runRecords } = fixture(true);
    const created = await call("/flows/flow-1/runs", "POST", { trigger: { payload: "hi" } });
    expect(created.status).toBe(201);
    const record = (await created.json()) as FlowRunRecord;
    expect(record.run.status).toBe("succeeded");
    expect(record.run.flowId).toBe("flow-1");
    expect(record.flowName).toBe("Ping");
    expect(record.document).toEqual(document);
    expect(posted).toEqual([{ content: "hi" }]);
    expect(runRecords).toHaveLength(1);

    const all = await call("/runs", "GET");
    expect(parseResponse(listAllRunsContract, all.status, await all.json()).data).toEqual({
      runs: [
        {
          id: record.run.id,
          flowId: "flow-1",
          flowName: "Ping",
          status: "succeeded",
          source: "manual",
          startedAt: record.run.startedAt,
          finishedAt: record.run.finishedAt,
        },
      ],
    });
    const byFlow = await call("/flows/flow-1/runs", "GET");
    expect(((await byFlow.json()) as { runs: unknown[] }).runs).toHaveLength(1);
    const one = await call(`/runs/${record.run.id}`, "GET");
    expect(parseResponse(getRunContract, one.status, await one.json()).data).toEqual(record);
  });

  test("lists runs a page at a time and follows the cursor without overlap", async () => {
    const { call, runRecords } = fixture(true);
    for (let index = 0; index < 5; index += 1) {
      expect((await call("/flows/flow-1/runs", "POST", {})).status).toBe(201);
    }
    expect(runRecords).toHaveLength(5);
    const page = async (path: string) => {
      const response = await call(path, "GET");
      const parsed = parseResponse(listAllRunsContract, response.status, await response.json());
      if (parsed.status !== 200) throw new Error(`expected a page, got ${parsed.status}`);
      return parsed.data;
    };
    const first = await page("/runs?limit=2");
    expect(first.runs).toHaveLength(2);
    expect(first.nextCursor).toBeString();
    const second = await page(`/runs?limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`);
    expect(second.runs).toHaveLength(2);
    expect(second.nextCursor).toBeString();
    const third = await page(`/runs?limit=2&cursor=${encodeURIComponent(second.nextCursor!)}`);
    expect(third.runs).toHaveLength(1);
    expect(third.nextCursor).toBeUndefined();
    const ids = [...first.runs, ...second.runs, ...third.runs].map((run) => run.id);
    expect(new Set(ids).size).toBe(5);
    expect(ids).toEqual((await page("/runs")).runs.map((run) => run.id));
    // The per-flow list pages the same way, and a whole list fits in one default page.
    const byFlow = await page(`/flows/flow-1/runs?limit=4`);
    expect(byFlow.runs).toHaveLength(4);
    expect(byFlow.nextCursor).toBeString();
  });

  test("a cursor the store cannot read, or a limit out of range, is a bad request", async () => {
    const { call } = fixture(true);
    await call("/flows/flow-1/runs", "POST", {});
    for (const path of [
      "/runs?cursor=nope",
      "/flows/flow-1/runs?cursor=nope",
      "/runs?limit=0",
      "/runs?limit=101",
      "/runs?limit=abc",
      "/runs?limit=1.5",
      "/flows/flow-1/runs?limit=-1",
    ]) {
      const response = await call(path, "GET");
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_request" });
    }
  });

  test("another user's flow and runs are not found", async () => {
    const { call, runRecords } = fixture(true);
    await call("/flows/flow-1/runs", "POST", {});
    const id = runRecords[0]!.run.id;
    expect((await call("/flows/flow-1/runs", "POST", {}, "bob")).status).toBe(401);
    expect(runRecords).toHaveLength(1);
    expect((await call("/flows/flow-2/runs", "POST", {})).status).toBe(404);
    expect((await call("/flows/flow-2/runs", "GET")).status).toBe(404);
    expect((await call(`/runs/${id}x`, "GET")).status).toBe(404);
  });

  test("a run whose snapshot no longer matches the document schema is a 422, not a 500", async () => {
    const { call, runRecords } = fixture(true);
    await call("/flows/flow-1/runs", "POST", {});
    const record = runRecords[0]!;
    record.document = {
      ...document,
      nodes: [{ ...document.nodes[0]!, type: "world.retired" as never }],
      edges: [],
    };
    const response = await call(`/runs/${record.run.id}`, "GET");
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "invalid_flow" });
  });

  test("a body that is not a trigger choice is a bad request and stores nothing", async () => {
    const { call, runRecords } = fixture(true);
    const response = await call("/flows/flow-1/runs", "POST", { document });
    expect(response.status).toBe(400);
    expect(runRecords).toHaveLength(0);
  });
});
