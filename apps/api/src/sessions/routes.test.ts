import { describe, expect, test } from "bun:test";
import {
  answerMiniAppSessionContract,
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
import { createSessionRoutes } from "./routes";

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
    /** Stubbed visitor identity: the token it accepts; absent leaves sign-in unconfigured. */
    visitorToken?: string;
    /** Stubbed World verifier; absent leaves World ID unconfigured. */
    world?: WorldVerifier;
  } = {},
) {
  const timestamp = "2026-09-07T10:00:00.000Z";
  const records = new Map<string, FlowRecord>([
    ["flow-1", { flow: document, createdAt: timestamp, updatedAt: timestamp }],
    ["flow-2", { flow: gated, createdAt: timestamp, updatedAt: timestamp }],
  ]);
  const flows = {
    findPublishedWithOwner: async (id: string) => {
      const record = records.get(id);
      return record ? { record, ownerId: "did:privy:alice" } : null;
    },
  } as unknown as FlowStore;
  const created: { ownerId: string; source: FlowRunSource | undefined; run: FlowRun }[] = [];
  const runs = {
    create: async (ownerId: string, doc: FlowDocument, run: FlowRun, source?: FlowRunSource) => {
      created.push({ ownerId, source, run });
      return {
        run,
        flowName: doc.name,
        document: doc,
        source: source ?? "manual",
      } as FlowRunRecord;
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
      identity:
        options.visitorToken === undefined
          ? undefined
          : { visitor: async (token) => (token === options.visitorToken ? ada : null) },
      world: options.world,
    }),
  );
  const post = (path: string, body?: unknown) =>
    app.handle(
      new Request(`http://localhost${path}`, {
        method: "POST",
        headers: body === undefined ? {} : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  return { post, created, rows, posted };
}

async function start(post: ReturnType<typeof fixture>["post"], flowId = "flow-1") {
  const response = await post(`/public/flows/${flowId}/sessions`);
  const result = parseResponse(startMiniAppSessionContract, response.status, await response.json());
  if (result.status !== 201) throw new Error(`start failed with ${result.status}`);
  return result.data;
}

describe("mini-app sessions", () => {
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

  test("reports a failed step to the visitor without the config", async () => {
    const { post } = fixture({ secrets: {} });
    const session = await start(post);
    const response = await post(`/public/flows/flow-1/sessions/${session.sessionId}/answer`, {
      token: session.token,
      port: "submitted",
      data: { email: "ada@example.com" },
    });
    const failed = (await response.json()) as MiniAppSession;
    expect(failed.status).toBe("failed");
    expect(failed.error).toBe('Secret "hook" is not defined');
    expect(failed.steps).toEqual([
      { nodeId: "d", label: "Announce", status: "failed", error: 'Secret "hook" is not defined' },
    ]);
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
  merkle_root: "0x1",
  nullifier_hash: "0x2",
  proof: "0x3",
  verification_level: "orb",
};

function stubWorld(verdict: "accept" | "reject" | "down") {
  const calls: { action: string; signal: string; proof: WorldProof }[] = [];
  const world: WorldVerifier = {
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
          nullifierHash: input.proof.nullifier_hash,
          verificationLevel: input.proof.verification_level,
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
    expect(failed.json.error).toContain("Sign-in is not configured");
    expect(created.at(-1)!.run.nodes[1]).toMatchObject({ nodeId: "login", status: "failed" });
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
    await answer(unconfigured.post, other, { port: "user", privyToken: "good-jwt" });
    const failed = await answer(unconfigured.post, other, { port: "verified", worldProof: proof });
    expect(failed.json.status).toBe("failed");
    expect(failed.json.error).toContain("World ID is not configured");
  });
});
