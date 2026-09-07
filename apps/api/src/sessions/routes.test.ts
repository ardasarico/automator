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

/** trigger → form → discord (webhook from a secret) → page. */
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

/** trigger → Privy login → World ID verify → discord (verified) / page (rejected). */
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
    /** The published document served as `flow-1`; the fixture document by default. */
    flow?: FlowDocument;
    /** Stubbed visitor identity: the token it accepts; absent leaves sign-in unconfigured. */
    visitorToken?: string;
    /** Stubbed World verifier; absent leaves World ID unconfigured. */
    world?: WorldVerifier;
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
        sleep: async () => {},
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
  const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
    app.handle(
      new Request(`http://localhost${path}`, {
        method: "POST",
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  return { post, created, rows, posted, snapshots, records };
}

async function start(post: ReturnType<typeof fixture>["post"], flowId = "flow-1") {
  const response = await post(`/public/flows/${flowId}/sessions`);
  const result = parseResponse(startMiniAppSessionContract, response.status, await response.json());
  if (result.status !== 201) throw new Error(`start failed with ${result.status}`);
  return result.data;
}

describe("mini-app sessions", () => {
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
    // A new publication must not silently alter an already-running visitor's graph.
    records.get("flow-1")!.flow = { ...branched, nodes: [], edges: [] };
    const answer = (port: string) =>
      post(`/public/flows/flow-1/sessions/${session.sessionId}/answer`, {
        token: session.token,
        port,
        data: { email: "qa@example.com" },
      });
    expect((await answer("submitted")).status).toBe(200);
    const final = await answer("next");
    expect(final.status).toBe(200);
    expect(await final.json()).toMatchObject({ status: "end" });
    expect(posted).toHaveLength(1);
    expect(created.at(-1)!.run.nodes.find((n) => n.nodeId === "join")?.outputs).toEqual({
      merged: [{ messageId: "m1", channelId: "c1" }, { email: "qa@example.com" }],
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
      port: "next",
    });
    expect(((await end.json()) as MiniAppSession).status).toBe("end");
    const again = await post(`/public/flows/flow-1/sessions/${session.sessionId}/answer`, {
      token: session.token,
      port: "next",
    });
    expect(again.status).toBe(409);
  });

  test("reports a failure to the visitor without the error, the config or the secret", async () => {
    const { post, created } = fixture({ secrets: {} });
    const session = await start(post);
    const response = await post(`/public/flows/flow-1/sessions/${session.sessionId}/answer`, {
      token: session.token,
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
    // The owner's stored run keeps the real error.
    expect(created[1]!.run.nodes.find((n) => n.nodeId === "d")?.error).toBe(
      'Secret "hook" is not defined',
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
    const answer = { token: session.token, port: "submitted", data: { email: "a@b.c" } };
    expect((await post(path, answer, visitor)).status).toBe(200);
    const limited = await post(path, answer, visitor);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect(await limited.json()).toEqual({ error: "rate_limited" });
    expect((await post("/public/flows/flow-1/sessions", undefined, visitor)).status).toBe(429);
    expect(created).toHaveLength(2);
    // Another address, forwarded or not, has a window of its own.
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
    expect((await post(path, { token: "nope", port: "submitted" })).status).toBe(404);
    expect((await post(path, { token: session.token, port: "cancelled" })).status).toBe(400);
    expect((await post(path, { port: "submitted" })).status).toBe(400);
    expect((await post("/public/flows/other/sessions")).status).toBe(404);
    expect(
      (
        await post(`/public/flows/other/sessions/${session.sessionId}/answer`, {
          token: session.token,
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
  const calls: { action: string; signal: string; proof: WorldProof }[] = [];
  let nonce = 0;
  const world: WorldVerifier = {
    requestContext(action) {
      nonce += 1;
      return {
        appId: "app_123",
        environment: "staging",
        rpContext: {
          rp_id: "rp_456",
          nonce: `0x${nonce}`,
          created_at: 1,
          expires_at: 301,
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
    ...body,
  });
  return { status: response.status, json: (await response.json()) as MiniAppSession };
}

describe("identity screens in sessions", () => {
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
      // A visitor cannot smuggle an identity through the form data.
      data: { userId: "did:privy:mallory", email: "mallory@example.com" },
    });
    expect(next.status).toBe(200);
    expect(next.json.status).toBe("screen");
    expect(next.json.screen).toMatchObject({
      nodeId: "verify",
      type: "world.id-verify",
      // The signal template resolved against vars, so the runtime binds the proof to it.
      config: { action: "claim", verificationLevel: "orb", signal: "0xAda" },
      // A signed request context for the action, so IDKit can open without World credentials.
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
    // The visitor sees the generic sentence and a code; the real reason stays in the stored run.
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
    expect(calls).toEqual([{ action: "claim", signal: "0xAda", proof }]);
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
    // No World configuration: the screen comes without a request context.
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
