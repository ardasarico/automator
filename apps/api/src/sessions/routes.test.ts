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
} from "@automator/contracts";
import type { FlowStore, MiniAppSessionRow, RunStore, SessionStore } from "@automator/db";
import { Elysia } from "elysia";
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

function fixture(
  options: { secrets?: Record<string, string>; callsPerMinute?: number; flow?: FlowDocument } = {},
) {
  const record: FlowRecord = {
    flow: options.flow ?? document,
    createdAt: "2026-09-07T10:00:00.000Z",
    updatedAt: "2026-09-07T10:00:00.000Z",
  };
  const flows = {
    findPublishedWithOwner: async (id: string) =>
      id === "flow-1" ? { record, ownerId: "did:privy:alice" } : null,
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
      callsPerMinute: options.callsPerMinute,
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
  return { post, created, rows, posted };
}

async function start(post: ReturnType<typeof fixture>["post"]) {
  const response = await post("/public/flows/flow-1/sessions");
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
    ["No language model is configured; set OPENROUTER_API_KEY", "unconfigured"],
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
