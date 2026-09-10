import { describe, expect, test } from "bun:test";
import {
  answerMiniAppSessionContract,
  miniAppFailureMessage,
  parseResponse,
  startMiniAppSessionContract,
  type FlowDocument,
  type FlowRecord,
  type FlowRun,
  type FlowRunRecord,
  type FlowRunSource,
  type MiniAppSession,
  type VisitorUser,
  type WorldProof,
} from "@automator/contracts";
import type { FlowStore, MiniAppSessionRow, RunStore, SessionStore } from "@automator/db";
import { Elysia } from "elysia";
import { WorldVerifyError, type WorldVerifier } from "../world/verify";
import { createSessionRoutes, failureCode } from "./routes";

const document: FlowDocument = {
  version: 1,
  id: "flow-1",
  name: "Signup",
  description: "",
  nodes: [
    { id: "t", type: "trigger.miniapp-open", position: { x: 0, y: 0 }, label: "Open", config: {} },
    {
      id: "form",
      type: "screen.form",
      position: { x: 0, y: 0 },
      label: "Your details",
      config: { title: "Join", fields: [{ id: "email", label: "Email", type: "email" }] },
    },
    {
      id: "d",
      type: "notify.discord",
      position: { x: 0, y: 0 },
      label: "Announce",
      config: { webhookUrl: "{{secrets.hook}}", content: "New: {{input.message.email}}" },
    },
    { id: "done", type: "screen.page", position: { x: 0, y: 0 }, label: "Thanks", config: {} },
  ],
  edges: [
    { id: "1", source: "t", target: "form", sourceHandle: "visitor", targetHandle: "data" },
    { id: "2", source: "form", target: "d", sourceHandle: "submitted", targetHandle: "message" },
    { id: "3", source: "d", target: "done", sourceHandle: "sent", targetHandle: "data" },
  ],
};

const gated: FlowDocument = {
  version: 1,
  id: "flow-2",
  name: "Claim",
  description: "",
  nodes: [
    { id: "t", type: "trigger.miniapp-open", position: { x: 0, y: 0 }, label: "Open", config: {} },
    {
      id: "login",
      type: "privy.login",
      position: { x: 0, y: 0 },
      label: "Sign in",
      config: { title: "Who are you?", methods: ["email"] },
    },
    {
      id: "verify",
      type: "world.id-verify",
      position: { x: 0, y: 0 },
      label: "Prove personhood",
      config: { action: "claim", verificationLevel: "orb", signal: "{{vars.visitor.wallet}}" },
    },
    {
      id: "d",
      type: "notify.discord",
      position: { x: 0, y: 0 },
      label: "Announce",
      config: {
        webhookUrl: "{{secrets.hook}}",
        content: "{{vars.visitor.email}} verified as {{input.message.nullifierHash}}",
      },
    },
    { id: "no", type: "screen.page", position: { x: 0, y: 0 }, label: "Not verified", config: {} },
  ],
  edges: [
    { id: "1", source: "t", target: "login", sourceHandle: "visitor", targetHandle: "visitor" },
    { id: "2", source: "login", target: "verify", sourceHandle: "user", targetHandle: "visitor" },
    { id: "3", source: "verify", target: "d", sourceHandle: "verified", targetHandle: "message" },
    { id: "4", source: "verify", target: "no", sourceHandle: "rejected", targetHandle: "data" },
  ],
};

const ada: VisitorUser = {
  userId: "did:privy:ada",
  wallet: "0xAda",
  email: "ada@example.com",
  loginMethod: "email",
};

function fixture(
  options: {
    secrets?: Record<string, string>;
    callsPerMinute?: number;
    flow?: FlowDocument;
    visitorToken?: string;
    world?: WorldVerifier;
    sleep?: (ms: number) => Promise<void>;
  } = {},
) {
  const timestamp = "2026-09-07T10:00:00.000Z";
  const records = new Map<string, FlowRecord>([
    ["flow-1", { flow: options.flow ?? document, createdAt: timestamp, updatedAt: timestamp }],
    ["flow-2", { flow: gated, createdAt: timestamp, updatedAt: timestamp }],
  ]);
  const flows = {
    findPublishedWithOwner: async (id: string) => {
      const record = records.get(id);
      return record ? { record, ownerId: "did:privy:alice" } : null;
    },
  } as unknown as FlowStore;
  const created: { ownerId: string; source: FlowRunSource | undefined; run: FlowRun }[] = [];
  const snapshots = new Map<string, FlowRunRecord & { ownerId: string }>();
  const runs = {
    create: async (ownerId: string, doc: FlowDocument, run: FlowRun, source?: FlowRunSource) => {
      created.push({ ownerId, source, run });
      const record = {
        run,
        flowName: doc.name,
        document: structuredClone(doc),
        source: source ?? "manual",
      } as FlowRunRecord;
      snapshots.set(run.id, { ...record, ownerId });
      return record;
    },
    find: async (ownerId: string, id: string) => {
      const record = snapshots.get(id);
      return record?.ownerId === ownerId ? record : null;
    },
  } as unknown as RunStore;
  const rows = new Map<string, MiniAppSessionRow>();
  const sessions: SessionStore = {
    async create(row) {
      rows.set(row.id, { ...row });
    },
    async find(flowId, id) {
      const row = rows.get(id);
      return row && row.flowId === flowId ? row : null;
    },
    async claim(expected) {
      const row = rows.get(expected.id);
      if (
        !row ||
        row.status !== "screen" ||
        row.nodeId !== expected.nodeId ||
        row.lastRunId !== expected.lastRunId ||
        row.tokenHash !== expected.tokenHash
      )
        return false;
      rows.set(row.id, { ...row, status: "failed", nodeId: null });
      return true;
    },
    async update(id, patch) {
      rows.set(id, { ...rows.get(id)!, ...patch });
    },
  };
  const posted: unknown[] = [];
  const app = new Elysia().use(
    createSessionRoutes({
      flows,
      runs,
      sessions,
      engine: {
        sleep: options.sleep ?? (async () => {}),
        fetch: (async (url: string | URL | Request, init?: RequestInit) => {
          posted.push({ url: String(url), body: JSON.parse(String(init?.body)) });
          return Response.json({ id: "m1", channel_id: "c1" });
        }) as typeof fetch,
      },
      secretsFor: options.secrets ? () => ({ get: async () => options.secrets! }) : undefined,
      callsPerMinute: options.callsPerMinute,
      identity:
        options.visitorToken === undefined
          ? undefined
          : { visitor: async (token) => (token === options.visitorToken ? ada : null) },
      world: options.world,
    }),
  );
  const post = (
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
    signal?: AbortSignal,
  ) =>
    app.handle(
      new Request(`http://localhost${path}`, {
        method: "POST",
        signal,
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  return { post, created, rows, posted, snapshots, records, runs };
}

async function start(post: ReturnType<typeof fixture>["post"], flowId = "flow-1") {
  const response = await post(`/public/flows/${flowId}/sessions`);
  const result = parseResponse(startMiniAppSessionContract, response.status, await response.json());
  if (result.status !== 201) throw new Error(`start failed with ${result.status}`);
  return result.data;
}

describe("mini-app sessions", () => {
  test("form constraints are enforced before the owner's steps run and invalid answers stay retryable", async () => {
    const flow = structuredClone(document);
    flow.nodes.find((node) => node.id === "form")!.config.fields = [
      { id: "email", type: "email", label: "Email", required: true },
      { id: "count", type: "number", label: "Count", required: true },
    ];
    const { post, posted, rows } = fixture({
      flow,
      secrets: { hook: "https://discord.com/api/webhooks/1/abc" },
    });
    const session = await start(post);
    const path = `/public/flows/flow-1/sessions/${session.sessionId}/answer`;
    for (const data of [
      undefined,
      { email: "bad", count: "1" },
      { email: "a@b.c", count: "Infinity" },
      { email: "a@b.c", count: "1", recipient: "attacker" },
    ]) {
      expect(
        (await post(path, { token: session.token, nodeId: "form", port: "submitted", data }))
          .status,
      ).toBe(400);
    }
    expect(posted).toHaveLength(0);
    expect(rows.get(session.sessionId)?.nodeId).toBe("form");
    expect(
      (
        await post(path, {
          token: session.token,
          nodeId: "form",
          port: "submitted",
          data: { email: "a@b.c", count: "1.5" },
        })
      ).status,
    ).toBe(200);
    expect(posted).toHaveLength(1);
  });

  test("concurrent answers execute the owner's side effect once", async () => {
    const { post, posted, created } = fixture({
      secrets: { hook: "https://discord.com/api/webhooks/1/abc" },
    });
    const session = await start(post);
    const path = `/public/flows/flow-1/sessions/${session.sessionId}/answer`;
    const body = {
      token: session.token,
      nodeId: "form",
      port: "submitted",
      data: { email: "qa@example.com" },
    };
    const responses = await Promise.all([post(path, body), post(path, body)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(posted).toHaveLength(1);
    expect(created).toHaveLength(2);
  });

  test.each(["start", "answer"] as const)(
    "a disconnected %s request cancels a pending wait before the owner's notification",
    async (phase) => {
      const flow = structuredClone(document);
      flow.nodes.push({
        id: "wait",
        type: "logic.wait",
        position: { x: 0, y: 0 },
        label: "Wait",
        config: { seconds: 30 },
      });
      flow.edges = [
        ...(phase === "answer" ? [flow.edges[0]!] : []),
        {
          id: "to-wait",
          source: phase === "start" ? "t" : "form",
          sourceHandle: phase === "start" ? "visitor" : "submitted",
          target: "wait",
          targetHandle: "data",
        },
        {
          id: "to-message",
          source: "wait",
          sourceHandle: "done",
          target: "d",
          targetHandle: "message",
        },
        flow.edges[2]!,
      ];
      const waiting = Promise.withResolvers<void>();
      const timer = Promise.withResolvers<void>();
      const { post, posted, rows, created } = fixture({
        flow,
        secrets: { hook: "https://discord.com/api/webhooks/1/abc" },
        sleep: async () => {
          waiting.resolve();
          await timer.promise;
        },
      });
      const session = phase === "answer" ? await start(post) : undefined;
      const controller = new AbortController();
      const response = post(
        session
          ? `/public/flows/flow-1/sessions/${session.sessionId}/answer`
          : "/public/flows/flow-1/sessions",
        session ? { token: session.token, nodeId: "form", port: "submitted" } : undefined,
        {},
        controller.signal,
      );
      await waiting.promise;
      controller.abort();
      timer.resolve();
      const result = await response;
      expect(result.status).toBe(phase === "start" ? 201 : 200);
      expect(await result.json()).toMatchObject({ status: "failed", code: "cancelled" });
      expect(posted).toHaveLength(0);
      expect(created.at(-1)?.run.status).toBe("failed");
      expect([...rows.values()].at(-1)).toMatchObject({ status: "failed", nodeId: null });
    },
  );

  test("a delayed answer cannot advance a different screen with the same port", async () => {
    const flow: FlowDocument = {
      ...document,
      nodes: [
        document.nodes[0]!,
        { id: "one", type: "screen.page", position: { x: 0, y: 0 }, label: "One", config: {} },
        { id: "two", type: "screen.page", position: { x: 0, y: 0 }, label: "Two", config: {} },
      ],
      edges: [
        { id: "a", source: "t", sourceHandle: "visitor", target: "one", targetHandle: "data" },
        { id: "b", source: "one", sourceHandle: "next", target: "two", targetHandle: "data" },
      ],
    };
    const { post, rows } = fixture({ flow });
    const session = await start(post);
    const path = `/public/flows/flow-1/sessions/${session.sessionId}/answer`;
    const body = { token: session.token, nodeId: "one", port: "next" };
    expect((await post(path, body)).status).toBe(200);
    expect((await post(path, body)).status).toBe(409);
    expect(rows.get(session.sessionId)?.nodeId).toBe("two");
  });

  test("a storage failure after effects consumes the screen instead of sending twice", async () => {
    const { post, rows, posted, runs } = fixture({
      secrets: { hook: "https://discord.com/api/webhooks/1/abc" },
    });
    const session = await start(post);
    runs.create = async () => {
      throw new Error("storage unavailable");
    };
    const path = `/public/flows/flow-1/sessions/${session.sessionId}/answer`;
    const body = { token: session.token, nodeId: "form", port: "submitted" };
    expect((await post(path, body)).status).toBe(500);
    expect(rows.get(session.sessionId)).toMatchObject({ status: "failed", nodeId: null });
    expect((await post(path, body)).status).toBe(409);
    expect(posted).toHaveLength(1);
  });

  test("resolves screen inputs, variables and trigger data across visitor pauses", async () => {
    const flow: FlowDocument = {
      ...document,
      nodes: [
        {
          id: "t",
          type: "trigger.miniapp-open",
          label: "Open",
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: "form",
          type: "screen.form",
          label: "Tickets",
          position: { x: 0, y: 0 },
          config: { fields: [{ id: "ticketCount", type: "number" }] },
        },
        {
          id: "keep",
          type: "logic.set-variable",
          label: "Keep",
          position: { x: 0, y: 0 },
          config: { name: "count", value: "{{input.value.ticketCount}}" },
        },
        {
          id: "page",
          type: "screen.page",
          label: "Result",
          position: { x: 0, y: 0 },
          config: {
            body: "Count {{input.data}} / {{vars.count}}",
            title: "Opened {{trigger.openedAt}}",
          },
        },
        {
          id: "end",
          type: "screen.page",
          label: "End",
          position: { x: 0, y: 0 },
          config: { body: "Still {{vars.count}}" },
        },
      ],
      edges: [
        { id: "a", source: "t", sourceHandle: "visitor", target: "form", targetHandle: "data" },
        {
          id: "b",
          source: "form",
          sourceHandle: "submitted",
          target: "keep",
          targetHandle: "value",
        },
        { id: "c", source: "keep", sourceHandle: "value", target: "page", targetHandle: "data" },
        { id: "d", source: "page", sourceHandle: "next", target: "end", targetHandle: "data" },
      ],
    };
    const { post, posted } = fixture({ flow });
    const opened = await start(post);
    const answer = async (port: string, data?: Record<string, string>) => {
      const response = await post(`/public/flows/flow-1/sessions/${opened.sessionId}/answer`, {
        token: opened.token,
        nodeId: port === "submitted" ? "form" : "page",
        port,
        data,
      });
      expect(response.status).toBe(200);
      const parsed = parseResponse(
        answerMiniAppSessionContract,
        response.status,
        await response.json(),
      );
      if (parsed.status !== 200) throw new Error("Expected a session response");
      return parsed.data;
    };
    const result = await answer("submitted", { ticketCount: "3" });
    expect(result.screen!.config.body).toBe("Count 3 / 3");
    expect(result.screen!.config.title).toMatch(/^Opened \d{4}-/);
    expect((await answer("next")).screen!.config.body).toBe("Still 3");
    expect(posted).toEqual([]);
    expect(flow.nodes[3]!.config.body).toContain("{{input.data}}");
  });

  test("two screen pauses retain a sibling output without sending twice, even after republishing", async () => {
    const branched = structuredClone(document);
    branched.nodes.push({
      id: "join",
      type: "logic.merge",
      label: "Join",
      position: { x: 0, y: 0 },
      config: { mode: "list" },
    });
    branched.nodes.find((node) => node.id === "d")!.config.content = "QA";
    branched.edges = [
      { id: "1", source: "t", sourceHandle: "visitor", target: "d", targetHandle: "message" },
      { id: "2", source: "t", sourceHandle: "visitor", target: "form", targetHandle: "data" },
      { id: "3", source: "form", sourceHandle: "submitted", target: "done", targetHandle: "data" },
      { id: "4", source: "d", sourceHandle: "sent", target: "join", targetHandle: "a" },
      { id: "5", source: "done", sourceHandle: "next", target: "join", targetHandle: "b" },
    ];
    const { post, posted, created, records } = fixture({
      flow: branched,
      secrets: { hook: "https://discord.com/api/webhooks/1/abc" },
    });
    const session = await start(post);
    expect(posted).toHaveLength(1);
    records.get("flow-1")!.flow = { ...branched, nodes: [], edges: [] };
    const answer = (port: string) =>
      post(`/public/flows/flow-1/sessions/${session.sessionId}/answer`, {
        token: session.token,
        nodeId: port === "submitted" ? "form" : "done",
        port,
        data: { email: "qa@example.com" },
      });
    expect((await answer("submitted")).status).toBe(200);
    const final = await answer("next");
    expect(final.status).toBe(200);
    expect(await final.json()).toMatchObject({ status: "end" });
    expect(posted).toHaveLength(1);
    expect(created.at(-1)!.run.nodes.find((n) => n.nodeId === "join")?.outputs).toEqual({
      merged: [{ messageId: "m1", channelId: "c1" }, { action: "next" }],
    });
  });

  test("a missing continuation snapshot fails before running any step", async () => {
    const { post, snapshots, posted } = fixture({
      secrets: { hook: "https://discord.com/api/webhooks/1/abc" },
    });
    const session = await start(post);
    snapshots.clear();
    const response = await post(`/public/flows/flow-1/sessions/${session.sessionId}/answer`, {
      token: session.token,
      nodeId: "form",
      port: "submitted",
    });
    expect(response.status).toBe(409);
    expect(posted).toHaveLength(0);
  });

  test("starts on the first screen with only that screen's config", async () => {
    const { post, created, rows } = fixture();
    const session = await start(post);
    expect(session.status).toBe("screen");
    expect(session.token).toBeString();
    expect(session.screen).toEqual({
      nodeId: "form",
      type: "screen.form",
      label: "Your details",
      config: expect.objectContaining({ title: "Join" }),
    });
    expect(JSON.stringify(session)).not.toContain("secrets.hook");
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ ownerId: "did:privy:alice", source: "miniapp" });
    expect(created[0]!.run.status).toBe("waiting");
    const row = rows.get(session.sessionId)!;
    expect(row.nodeId).toBe("form");
    expect(row.tokenHash).not.toBe(session.token);
  });

  test("answering runs the steps with the owner's secrets and moves on", async () => {
    const { post, posted, created } = fixture({
      secrets: { hook: "https://discord.com/api/webhooks/1/abc" },
    });
    const session = await start(post);
    const response = await post(`/public/flows/flow-1/sessions/${session.sessionId}/answer`, {
      token: session.token,
      nodeId: "form",
      port: "submitted",
      data: { email: "ada@example.com" },
    });
    const result = parseResponse(
      answerMiniAppSessionContract,
      response.status,
      await response.json(),
    );
    if (result.status !== 200) throw new Error(`answer failed with ${result.status}`);
    const next: MiniAppSession = result.data;
    expect(next.status).toBe("screen");
    expect(next.screen?.nodeId).toBe("done");
    expect(next.steps).toEqual([{ nodeId: "d", label: "Announce", status: "succeeded" }]);
    expect(next.token).toBeUndefined();
    expect(posted).toEqual([
      {
        url: "https://discord.com/api/webhooks/1/abc?wait=true",
        body: { content: "New: ada@example.com" },
      },
    ]);
    expect(created).toHaveLength(2);

    const end = await post(`/public/flows/flow-1/sessions/${session.sessionId}/answer`, {
      token: session.token,
      nodeId: "done",
      port: "next",
    });
    expect(((await end.json()) as MiniAppSession).status).toBe("end");
    const again = await post(`/public/flows/flow-1/sessions/${session.sessionId}/answer`, {
      token: session.token,
      nodeId: "done",
      port: "next",
    });
    expect(again.status).toBe(409);
  });

  test("reports a failure to the visitor without the error, the config or the secret", async () => {
    const { post, created } = fixture({ secrets: {} });
    const session = await start(post);
    const response = await post(`/public/flows/flow-1/sessions/${session.sessionId}/answer`, {
      token: session.token,
      nodeId: "form",
      port: "submitted",
      data: { email: "ada@example.com" },
    });
    const failed = (await response.json()) as MiniAppSession;
    expect(failed.status).toBe("failed");
    expect(failed.error).toBe("This app hit a problem and could not continue.");
    expect(failed.code).toBe("unconfigured");
    expect(failed.help).toBeUndefined();
    expect(failed.steps).toEqual([{ nodeId: "d", label: "Announce", status: "failed" }]);
    expect(JSON.stringify(failed)).not.toContain("hook");
    expect(created[1]!.run.nodes.find((n) => n.nodeId === "d")?.error).toBe(
      'Secret "hook" is not defined',
    );
  });

  test("tells the visitor the app cannot send funds when a payout is not set up to sign", async () => {
    const paying: FlowDocument = {
      ...document,
      nodes: document.nodes.map((node) =>
        node.id === "d"
          ? {
              ...node,
              type: "usdc.payout" as const,
              label: "Send USDC",
              config: { to: "0x" + "2".repeat(40), amount: "1" },
            }
          : node,
      ),
    };
    const { post, created } = fixture({ flow: paying });
    const session = await start(post);
    const response = await post(`/public/flows/flow-1/sessions/${session.sessionId}/answer`, {
      token: session.token,
      nodeId: "form",
      port: "submitted",
      data: { email: "ada@example.com" },
    });
    const failed = (await response.json()) as MiniAppSession;
    expect(failed.status).toBe("failed");
    expect(failed.code).toBe("unconfigured");
    expect(failed.error).toBe(
      "This app can't send funds right now. Its owner has to finish setting it up first.",
    );
    expect(JSON.stringify(failed)).not.toMatch(/No chain|signer|Privy|is not configured/i);
    expect(created[1]!.run.nodes.find((n) => n.nodeId === "d")?.error).toBe(
      "No chain is configured for this run",
    );
  });

  test("adds the owner's visitor message from the trigger config", async () => {
    const flow: FlowDocument = {
      ...document,
      nodes: document.nodes.map((node) =>
        node.id === "t"
          ? { ...node, config: { visitorErrorMessage: "  Contact @ada on Telegram  " } }
          : node,
      ),
    };
    const { post } = fixture({ secrets: {}, flow });
    const session = await start(post);
    const response = await post(`/public/flows/flow-1/sessions/${session.sessionId}/answer`, {
      token: session.token,
      nodeId: "form",
      port: "submitted",
      data: { email: "ada@example.com" },
    });
    const failed = (await response.json()) as MiniAppSession;
    expect(failed.status).toBe("failed");
    expect(failed.help).toBe("Contact @ada on Telegram");
  });

  test("calls beyond the per-address limit answer 429 on both routes", async () => {
    const { post, created } = fixture({ callsPerMinute: 2 });
    const visitor = { "x-forwarded-for": "203.0.113.9, 10.0.0.1" };
    const session = await start((path, body) => post(path, body, visitor));
    const path = `/public/flows/flow-1/sessions/${session.sessionId}/answer`;
    const answer = {
      token: session.token,
      nodeId: "form",
      port: "submitted",
      data: { email: "a@b.c" },
    };
    expect((await post(path, answer, visitor)).status).toBe(200);
    const limited = await post(path, answer, visitor);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect(await limited.json()).toEqual({ error: "rate_limited" });
    expect((await post("/public/flows/flow-1/sessions", undefined, visitor)).status).toBe(429);
    expect(created).toHaveLength(2);
    const other = { "x-forwarded-for": "198.51.100.4" };
    expect((await post("/public/flows/flow-1/sessions", undefined, other)).status).toBe(201);
    expect((await post("/public/flows/flow-1/sessions")).status).toBe(201);
  });

  test.each([
    [undefined, "node_failed"],
    ["Transaction 0xabc reverted", "node_failed"],
    ["The run was cancelled.", "cancelled"],
    ["timed out after 1000 ms", "timeout"],
    ["No language model is configured; set OPENROUTER_API_KEY or OPENAI_API_KEY", "unconfigured"],
    ["No chain is configured for this run", "unconfigured"],
    ['Secret "hook" is not defined', "unconfigured"],
    ["Server signing is not enabled for this wallet", "unconfigured"],
  ])("classifies %p as %s", (error, code) => {
    expect<string>(failureCode(error)).toBe(code);
  });

  test("rejects a wrong token, a wrong port, an unknown flow, and a bad body", async () => {
    const { post } = fixture();
    const session = await start(post);
    const path = `/public/flows/flow-1/sessions/${session.sessionId}/answer`;
    expect((await post(path, { token: "nope", nodeId: "form", port: "submitted" })).status).toBe(
      404,
    );
    expect(
      (await post(path, { token: session.token, nodeId: "form", port: "cancelled" })).status,
    ).toBe(400);
    expect((await post(path, { port: "submitted" })).status).toBe(400);
    expect((await post("/public/flows/other/sessions")).status).toBe(404);
    expect(
      (
        await post(`/public/flows/other/sessions/${session.sessionId}/answer`, {
          token: session.token,
          nodeId: "form",
          port: "submitted",
        })
      ).status,
    ).toBe(404);
  });
});

const proof: WorldProof = {
  protocol_version: "4.0",
  nonce: "0xabc",
  action: "claim",
  responses: [{ identifier: "proof_of_human", nullifier: "0x2", proof: ["0x1"] }],
};

function stubWorld(verdict: "accept" | "reject" | "down") {
  const calls: Parameters<WorldVerifier["verify"]>[0][] = [];
  let nonce = 0;
  const world: WorldVerifier = {
    requestContext(action) {
      nonce += 1;
      const createdAt = Math.floor(Date.now() / 1000);
      return {
        appId: "app_123",
        environment: "staging",
        rpContext: {
          rp_id: "rp_456",
          nonce: nonce === 1 ? proof.nonce : `${proof.nonce}-${nonce}`,
          created_at: createdAt,
          expires_at: createdAt + 300,
          signature: `0xsig-${action}`,
        },
      };
    },
    async verify(input) {
      calls.push(input);
      if (verdict === "down") throw new WorldVerifyError("World ID verification answered 502");
      if (verdict === "reject")
        return {
          ok: false,
          rejection: { code: "max_verifications_reached", detail: "Already verified." },
        };
      return {
        ok: true,
        verification: {
          nullifierHash: "0x2",
          verificationLevel: "proof_of_human",
          action: input.action,
        },
      };
    },
  };
  return { world, calls };
}

async function answer(
  post: ReturnType<typeof fixture>["post"],
  session: MiniAppSession,
  body: Record<string, unknown>,
) {
  const response = await post(`/public/flows/flow-2/sessions/${session.sessionId}/answer`, {
    token: session.token,
    nodeId: body.port === "user" ? "login" : "verify",
    ...body,
  });
  return { status: response.status, json: (await response.json()) as MiniAppSession };
}

describe("identity screens in sessions", () => {
  test("binds World proofs to the current session's issued nonce before contacting the verifier", async () => {
    const { world, calls } = stubWorld("accept");
    const { post, rows } = fixture({ visitorToken: "good-jwt", world });
    const first = await start(post, "flow-2");
    const second = await start(post, "flow-2");
    const issued = await answer(post, first, { port: "user", privyToken: "good-jwt" });
    const other = await answer(post, second, { port: "user", privyToken: "good-jwt" });
    expect(issued.json.screen?.world?.rpContext.nonce).not.toBe(
      other.json.screen?.world?.rpContext.nonce,
    );
    expect(rows.get(first.sessionId)).toMatchObject({
      worldNonce: issued.json.screen?.world?.rpContext.nonce,
      worldExpiresAt: issued.json.screen?.world?.rpContext.expires_at,
    });
    expect((await answer(post, second, { port: "verified", worldProof: proof })).status).toBe(400);
    expect(calls).toHaveLength(0);
    expect(rows.get(second.sessionId)?.nodeId).toBe("verify");
    const accepted = await answer(post, first, { port: "verified", worldProof: proof });
    expect(accepted.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(rows.get(first.sessionId)).toMatchObject({ worldNonce: null, worldExpiresAt: null });
  });

  test("an expired World request is rejected without verifying or advancing its screen", async () => {
    const { world, calls } = stubWorld("accept");
    const { post, rows } = fixture({ visitorToken: "good-jwt", world });
    const session = await start(post, "flow-2");
    await answer(post, session, { port: "user", privyToken: "good-jwt" });
    rows.get(session.sessionId)!.worldExpiresAt = Math.floor(Date.now() / 1000) - 1;
    expect((await answer(post, session, { port: "verified", worldProof: proof })).status).toBe(400);
    expect(calls).toHaveLength(0);
    expect(rows.get(session.sessionId)?.nodeId).toBe("verify");
  });

  test("opening directly onto a World screen stores its issued request", async () => {
    const { world } = stubWorld("accept");
    const flow: FlowDocument = {
      ...document,
      nodes: [document.nodes[0]!, { ...gated.nodes[2]!, config: { action: "claim" } }],
      edges: [
        {
          id: "a",
          source: "t",
          sourceHandle: "visitor",
          target: "verify",
          targetHandle: "visitor",
        },
      ],
    };
    const { post, rows } = fixture({ flow, world });
    const session = await start(post);
    expect(rows.get(session.sessionId)).toMatchObject({
      worldNonce: session.screen?.world?.rpContext.nonce,
      worldExpiresAt: session.screen?.world?.rpContext.expires_at,
    });
  });

  test("starts on the login screen with its parsed config", async () => {
    const { post } = fixture();
    const session = await start(post, "flow-2");
    expect(session.status).toBe("screen");
    expect(session.screen).toMatchObject({
      nodeId: "login",
      type: "privy.login",
      config: { title: "Who are you?", methods: ["email"], button: "Sign in" },
    });
  });

  test("verifies the Privy token, derives the visitor on the server, and moves on", async () => {
    const { post, rows } = fixture({ visitorToken: "good-jwt", world: stubWorld("accept").world });
    const session = await start(post, "flow-2");
    const next = await answer(post, session, {
      port: "user",
      privyToken: "good-jwt",
      data: { userId: "did:privy:mallory", email: "mallory@example.com" },
    });
    expect(next.status).toBe(200);
    expect(next.json.status).toBe("screen");
    expect(next.json.screen).toMatchObject({
      nodeId: "verify",
      type: "world.id-verify",
      config: { action: "claim", verificationLevel: "orb", signal: "0xAda" },
      world: {
        appId: "app_123",
        environment: "staging",
        rpContext: { rp_id: "rp_456", signature: "0xsig-claim" },
      },
    });
    const row = rows.get(session.sessionId)!;
    expect(row.variables).toMatchObject({ visitor: ada });
    expect(JSON.stringify(row)).not.toContain("good-jwt");
  });

  test("rejects a bad or missing Privy token without moving the session", async () => {
    const { post } = fixture({ visitorToken: "good-jwt" });
    const session = await start(post, "flow-2");
    expect((await answer(post, session, { port: "user", privyToken: "forged" })).status).toBe(401);
    expect((await answer(post, session, { port: "user" })).status).toBe(400);
    const retry = await answer(post, session, { port: "user", privyToken: "good-jwt" });
    expect(retry.json.screen?.nodeId).toBe("verify");
  });

  test("fails the login node as unconfigured when the API has no Privy credentials", async () => {
    const { post, created } = fixture();
    const session = await start(post, "flow-2");
    const failed = await answer(post, session, { port: "user", privyToken: "jwt" });
    expect(failed.status).toBe(200);
    expect(failed.json.status).toBe("failed");
    expect(failed.json.error).toBe(miniAppFailureMessage);
    expect(failed.json.code).toBe("unconfigured");
    expect(created.at(-1)!.run.nodes[1]).toMatchObject({ nodeId: "login", status: "failed" });
    expect(created.at(-1)!.run.nodes[1]!.error).toContain("Sign-in is not configured");
  });

  test("verifies the World proof against the resolved action and signal and takes Verified", async () => {
    const { world, calls } = stubWorld("accept");
    const { post } = fixture({
      visitorToken: "good-jwt",
      world,
      secrets: { hook: "https://discord.com/api/webhooks/1/abc" },
    });
    const session = await start(post, "flow-2");
    await answer(post, session, { port: "user", privyToken: "good-jwt" });
    const done = await answer(post, session, { port: "verified", worldProof: proof });
    expect(calls).toEqual([{ action: "claim", signal: "0xAda", verificationLevel: "orb", proof }]);
    expect(done.json.status).toBe("end");
    expect(done.json.steps).toEqual([{ nodeId: "d", label: "Announce", status: "succeeded" }]);
  });

  test("a rejected proof takes the Rejected branch with the portal's reason", async () => {
    const { world } = stubWorld("reject");
    const { post, created } = fixture({ visitorToken: "good-jwt", world });
    const session = await start(post, "flow-2");
    await answer(post, session, { port: "user", privyToken: "good-jwt" });
    const next = await answer(post, session, { port: "verified", worldProof: proof });
    expect(next.json.status).toBe("screen");
    expect(next.json.screen?.nodeId).toBe("no");
    expect(created.at(-1)!.run.nodes[2]!.outputs).toEqual({
      rejected: { code: "max_verifications_reached", detail: "Already verified." },
    });
  });

  test("a portal outage answers 503 so the visitor can retry; no verifier fails the node", async () => {
    const down = fixture({ visitorToken: "good-jwt", world: stubWorld("down").world });
    const session = await start(down.post, "flow-2");
    await answer(down.post, session, { port: "user", privyToken: "good-jwt" });
    expect((await answer(down.post, session, { port: "verified", worldProof: proof })).status).toBe(
      503,
    );
    expect((await answer(down.post, session, { port: "verified" })).status).toBe(400);

    const unconfigured = fixture({ visitorToken: "good-jwt" });
    const other = await start(unconfigured.post, "flow-2");
    const screen = await answer(unconfigured.post, other, { port: "user", privyToken: "good-jwt" });
    expect(screen.json.screen?.world).toBeUndefined();
    const failed = await answer(unconfigured.post, other, { port: "verified", worldProof: proof });
    expect(failed.json.status).toBe("failed");
    expect(failed.json.error).toBe(miniAppFailureMessage);
    expect(failed.json.code).toBe("unconfigured");
    expect(
      unconfigured.created.at(-1)!.run.nodes.find((node) => node.nodeId === "verify"),
    ).toMatchObject({
      status: "failed",
      error: expect.stringContaining("World ID is not configured"),
    });
  });
});

describe("selfie check screens in sessions", () => {
  const selfieFlow: FlowDocument = {
    ...document,
    id: "flow-1",
    nodes: [
      document.nodes[0]!,
      {
        id: "selfie",
        type: "world.selfie-check",
        position: { x: 0, y: 0 },
        label: "Selfie Check",
        config: { action: "claim", signal: "{{trigger.openedAt}}" },
      },
      {
        id: "gate",
        type: "logic.condition",
        position: { x: 0, y: 0 },
        label: "Verified?",
        config: { left: "{{input.value.verified}}", operator: "equals", right: "true" },
      },
      { id: "yes", type: "screen.page", position: { x: 0, y: 0 }, label: "Claimed", config: {} },
      { id: "no", type: "screen.page", position: { x: 0, y: 0 }, label: "Denied", config: {} },
    ],
    edges: [
      { id: "1", source: "t", target: "selfie", sourceHandle: "visitor", targetHandle: "visitor" },
      {
        id: "2",
        source: "selfie",
        target: "gate",
        sourceHandle: "verified",
        targetHandle: "value",
      },
      { id: "3", source: "selfie", target: "no", sourceHandle: "rejected", targetHandle: "data" },
      { id: "4", source: "gate", target: "yes", sourceHandle: "true", targetHandle: "data" },
      { id: "5", source: "gate", target: "no", sourceHandle: "false", targetHandle: "data" },
    ],
  };
  const selfieProof: WorldProof = {
    protocol_version: "3.0",
    nonce: proof.nonce,
    action: "claim",
    responses: [{ identifier: "selfie", nullifier: "0x6", proof: "0x1", merkle_root: "0x2" }],
  };

  function stubSelfie(verdict: "accept" | "reject") {
    const base = stubWorld(verdict);
    const calls: Parameters<WorldVerifier["verify"]>[0][] = [];
    const world: WorldVerifier = {
      requestContext: base.world.requestContext,
      async verify(input) {
        calls.push(input);
        if (verdict === "reject")
          return { ok: false, rejection: { code: "verification_rejected", detail: "Declined." } };
        return {
          ok: true,
          verification: { nullifierHash: "0x6", verificationLevel: "selfie", action: input.action },
        };
      },
    };
    return { world, calls };
  }

  async function answerSelfie(
    post: ReturnType<typeof fixture>["post"],
    session: MiniAppSession,
    body: Record<string, unknown>,
  ) {
    const response = await post(`/public/flows/flow-1/sessions/${session.sessionId}/answer`, {
      token: session.token,
      nodeId: "selfie",
      port: "verified",
      ...body,
    });
    return { status: response.status, json: (await response.json()) as MiniAppSession };
  }

  test("serves the screen with a request signed for its action and binds the answer to it", async () => {
    const { world, calls } = stubSelfie("accept");
    const { post, rows, created } = fixture({ flow: selfieFlow, world });
    const session = await start(post);
    expect(session.screen).toMatchObject({
      nodeId: "selfie",
      type: "world.selfie-check",
      config: { action: "claim", button: "Verify with Selfie Check" },
      world: { appId: "app_123", rpContext: { signature: "0xsig-claim" } },
    });
    expect(rows.get(session.sessionId)).toMatchObject({
      worldNonce: session.screen?.world?.rpContext.nonce,
    });
    const other = await start(post);
    expect((await answerSelfie(post, other, { worldProof: selfieProof })).status).toBe(400);
    expect(calls).toHaveLength(0);

    const done = await answerSelfie(post, session, { worldProof: selfieProof });
    expect(done.status).toBe(200);
    expect(calls).toEqual([
      {
        action: "claim",
        signal: expect.any(String),
        verificationLevel: "selfie",
        proof: selfieProof,
      },
    ]);
    expect(calls[0]!.signal).not.toBe("");
    expect(done.json.screen?.nodeId).toBe("yes");
    const run = created.at(-1)!.run;
    expect(run.nodes.find((node) => node.nodeId === "selfie")?.outputs).toEqual({
      verified: { verified: true, nullifierHash: "0x6", credential: "selfie", action: "claim" },
    });
    expect(run.nodes.find((node) => node.nodeId === "gate")?.status).toBe("succeeded");
  });

  test("a declined check takes Rejected with verified false and the portal's reason", async () => {
    const { world } = stubSelfie("reject");
    const { post, created } = fixture({ flow: selfieFlow, world });
    const session = await start(post);
    const next = await answerSelfie(post, session, { worldProof: selfieProof });
    expect(next.status).toBe(200);
    expect(next.json.screen?.nodeId).toBe("no");
    expect(created.at(-1)!.run.nodes.find((node) => node.nodeId === "selfie")?.outputs).toEqual({
      rejected: { verified: false, code: "verification_rejected", detail: "Declined." },
    });
  });

  test("a missing proof, a missing action and a missing verifier are told apart", async () => {
    const { world } = stubSelfie("accept");
    const { post } = fixture({ flow: selfieFlow, world });
    const session = await start(post);
    expect((await answerSelfie(post, session, {})).status).toBe(400);

    const noAction = {
      ...selfieFlow,
      nodes: selfieFlow.nodes.map((node) =>
        node.id === "selfie" ? { ...node, config: { signal: "" } } : node,
      ),
    };
    // Without an action no request is issued, so no proof can match the session's binding.
    const unconfigured = fixture({ flow: noAction, world });
    const bare = await start(unconfigured.post);
    expect(bare.screen?.world).toBeUndefined();
    expect((await answerSelfie(unconfigured.post, bare, { worldProof: selfieProof })).status).toBe(
      400,
    );

    const noWorld = fixture({ flow: selfieFlow });
    const offline = await start(noWorld.post);
    const down = await answerSelfie(noWorld.post, offline, { worldProof: selfieProof });
    expect(down.json.status).toBe("failed");
    expect(down.json.code).toBe("unconfigured");
  });
});
