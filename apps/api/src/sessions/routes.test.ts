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

function fixture(options: { secrets?: Record<string, string> } = {}) {
  const record: FlowRecord = {
    flow: document,
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
