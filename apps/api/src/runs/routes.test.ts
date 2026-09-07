import { describe, expect, test } from "bun:test";
import {
  getRunContract,
  listAllRunsContract,
  parseResponse,
  runFlowContract,
  type FlowDocument,
  type FlowRecord,
  type FlowRun,
  type FlowRunRecord,
} from "@automator/contracts";
import type { FlowStore, RunStore } from "@automator/db";
import { Elysia } from "elysia";
import type { IdentityProvider } from "../auth/privy";
import { createRunRoutes } from "./routes";

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

/** In-memory flow and run stores with the same owner scoping as the SQL ones. */
function stores() {
  const flowRecords = new Map<string, FlowRecord & { ownerId: string }>();
  const runRecords: Array<FlowRunRecord & { ownerId: string }> = [];
  const timestamp = "2026-09-07T10:00:00.000Z";
  flowRecords.set("flow-1", {
    ownerId: "did:privy:alice",
    flow: document,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  const flows = {
    find: async (ownerId: string, id: string) => {
      const record = flowRecords.get(id);
      return record && record.ownerId === ownerId
        ? { flow: record.flow, createdAt: record.createdAt, updatedAt: record.updatedAt }
        : null;
    },
  } as unknown as FlowStore;
  const runs: RunStore = {
    create: async (ownerId, flow, run: FlowRun, source = "manual") => {
      const record = { ownerId, run, flowName: flow.name, source, document: flow };
      runRecords.push(record);
      return { run, flowName: flow.name, source, document: flow };
    },
    latestStartedAt: async (flowId, source) => {
      const match = runRecords
        .filter((r) => r.run.flowId === flowId && r.source === source)
        .sort((a, b) => Date.parse(b.run.startedAt) - Date.parse(a.run.startedAt))[0];
      return match ? new Date(match.run.startedAt) : null;
    },
    list: async (ownerId, options = {}) =>
      runRecords
        .filter(
          (r) => r.ownerId === ownerId && (!options.flowId || r.run.flowId === options.flowId),
        )
        .map(({ run, flowName, source }) => ({
          id: run.id,
          flowId: run.flowId,
          flowName,
          status: run.status,
          source,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
        })),
    find: async (ownerId, id) => {
      const record = runRecords.find((r) => r.ownerId === ownerId && r.run.id === id);
      return record
        ? {
            run: record.run,
            flowName: record.flowName,
            source: record.source,
            document: record.document,
          }
        : null;
    },
  };
  return { flows, runs, runRecords };
}

function fixture(persisted = false, callsPerMinute?: number) {
  const posted: unknown[] = [];
  const persistence = persisted ? stores() : undefined;
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
  const post = (body: unknown, token?: string) =>
    app.handle(
      new Request(`http://localhost${runFlowContract.path}`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }),
    );
  const call = (path: string, method: string, body?: unknown, token = "alice") =>
    app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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

  test("a body that is not a trigger choice is a bad request and stores nothing", async () => {
    const { call, runRecords } = fixture(true);
    const response = await call("/flows/flow-1/runs", "POST", { document });
    expect(response.status).toBe(400);
    expect(runRecords).toHaveLength(0);
  });
});
