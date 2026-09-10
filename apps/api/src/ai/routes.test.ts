import { describe, expect, test } from "bun:test";
import {
  aiStreamEventSchema,
  Value,
  type AiMessage,
  type AiStreamEvent,
  type FlowRecord,
} from "@automator/contracts";
import type { AiMessageStore } from "@automator/db";
import { scriptedModel, type ChatResponse, type LanguageModel } from "@automator/flow-engine";
import { Elysia } from "elysia";
import type { IdentityProvider } from "../auth/privy";
import { createAiRoutes } from "./routes";

const identity: IdentityProvider = {
  verify: async (token) => (token === "alice" ? { id: "did:privy:alice", expiresAt: 2e9 } : null),
  walletAddress: async () => null,
};

const flowRecord: FlowRecord = {
  flow: { version: 1, id: "f1", name: "Ping", description: "", nodes: [], edges: [] },
  createdAt: "2026-09-11T00:00:00.000Z",
  updatedAt: "2026-09-11T00:00:00.000Z",
  enabled: false,
};

function memoryMessages(): AiMessageStore & { rows: Map<string, AiMessage[]> } {
  const rows = new Map<string, AiMessage[]>();
  const of = (flowId: string) => rows.get(flowId) ?? [];
  return {
    rows,
    async list(flowId) {
      return of(flowId);
    },
    async append(flowId, message) {
      const stored = { ...message, createdAt: new Date().toISOString() };
      rows.set(flowId, [...of(flowId), stored]);
      return stored;
    },
    async setProposalState(flowId, messageId, state) {
      const message = of(flowId).find((m) => m.id === messageId);
      if (!message) return null;
      message.parts = message.parts.map((p) => (p.type === "proposal" ? { ...p, state } : p));
      return message;
    },
    async markPendingStale(flowId) {
      for (const message of of(flowId))
        message.parts = message.parts.map((p) =>
          p.type === "proposal" && p.state === "pending" ? { ...p, state: "stale" } : p,
        );
    },
    async clear(flowId) {
      const had = of(flowId).length > 0;
      rows.delete(flowId);
      return had;
    },
  };
}

const flows = {
  find: async (ownerId: string, id: string) =>
    ownerId === "did:privy:alice" && id === "f1" ? flowRecord : null,
};

function fixture(model: LanguageModel | undefined, options: { callsPerMinute?: number } = {}) {
  const messages = memoryMessages();
  let n = 0;
  const app = new Elysia().use(
    createAiRoutes({ identity, model, flows, messages, newId: () => `id${(n += 1)}`, ...options }),
  );
  const call = (
    method: string,
    path: string,
    body?: unknown,
    token: string | undefined = "alice",
  ) =>
    app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  return { app, messages, call };
}

async function readEvents(response: Response): Promise<AiStreamEvent[]> {
  const text = await response.text();
  return text
    .split("\n\n")
    .filter((frame) => frame.startsWith("data: "))
    .map((frame) => JSON.parse(frame.slice(6)) as AiStreamEvent);
}

const turns: ChatResponse[] = [
  {
    content: "Adding a trigger.",
    toolCalls: [
      {
        id: "c1",
        name: "add_node",
        arguments: { id: "t", type: "trigger.manual", label: "Run", config: {} },
      },
    ],
  },
  { content: "Done.", toolCalls: [] },
];

describe("ai routes", () => {
  test("streams a turn and stores both messages", async () => {
    const { model } = scriptedModel(turns);
    const { call, messages } = fixture(model);
    const response = await call("POST", "/flows/f1/ai/messages", {
      text: "Make a trigger",
      context: { selection: [] },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/event-stream/);
    const events = await readEvents(response);
    for (const event of events)
      expect(Value.Check(aiStreamEventSchema, event), JSON.stringify(event)).toBe(true);
    expect(events[0]).toEqual({ type: "message", id: "id2" });
    expect(events.at(-1)).toEqual({ type: "done" });
    expect(events.some((event) => event.type === "proposal")).toBe(true);

    const stored = messages.rows.get("f1")!;
    expect(stored.map((message) => [message.id, message.role])).toEqual([
      ["id1", "user"],
      ["id2", "assistant"],
    ]);
    expect(stored[0]!.parts).toEqual([{ type: "text", text: "Make a trigger" }]);
    expect(stored[1]!.parts.at(-1)).toMatchObject({ type: "proposal", state: "pending" });
  });

  test("lists, patches a proposal and clears", async () => {
    const { model } = scriptedModel(turns);
    const { call } = fixture(model);
    // The turn keeps running after the Response is returned, so the assistant message is only
    // guaranteed stored once the stream itself has been read to its `done` event.
    await readEvents(await call("POST", "/flows/f1/ai/messages", { text: "Make a trigger" }));
    const listed = await call("GET", "/flows/f1/ai/messages");
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as { messages: AiMessage[] };
    expect(body.messages).toHaveLength(2);

    const patched = await call("PATCH", "/flows/f1/ai/messages/id2", { state: "applied" });
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as { message: AiMessage }).message.parts.at(-1)).toMatchObject({
      state: "applied",
    });
    expect((await call("PATCH", "/flows/f1/ai/messages/nope", { state: "applied" })).status).toBe(
      404,
    );

    const cleared = await call("DELETE", "/flows/f1/ai/messages");
    expect(await cleared.json()).toEqual({ cleared: true });
    expect(
      ((await (await call("GET", "/flows/f1/ai/messages")).json()) as { messages: AiMessage[] })
        .messages,
    ).toEqual([]);
  });

  test("a new message supersedes pending proposals", async () => {
    const { model } = scriptedModel([...turns, ...turns]);
    const { call, messages } = fixture(model);
    await readEvents(await call("POST", "/flows/f1/ai/messages", { text: "one" }));
    await readEvents(await call("POST", "/flows/f1/ai/messages", { text: "two" }));
    const stored = messages.rows.get("f1")!;
    expect(stored[1]!.parts.at(-1)).toMatchObject({ state: "stale" });
    expect(stored[3]!.parts.at(-1)).toMatchObject({ state: "pending" });
  });

  test("enforces ownership, auth, the model and the rate limit", async () => {
    const { model } = scriptedModel([]);
    const { call } = fixture(model, { callsPerMinute: 1 });
    expect((await call("GET", "/flows/f2/ai/messages")).status).toBe(404);
    // An explicit `undefined` here would still hit the fixture's own "alice" default; an empty
    // string is falsy and actually omits the Authorization header, unlike `undefined`.
    expect((await call("GET", "/flows/f1/ai/messages", undefined, "")).status).toBe(401);
    expect((await call("GET", "/flows/f1/ai/messages")).status).toBe(200);
    expect((await call("GET", "/flows/f1/ai/messages")).status).toBe(429);

    const noModel = fixture(undefined);
    expect((await noModel.call("POST", "/flows/f1/ai/messages", { text: "hi" })).status).toBe(503);
    expect((await noModel.call("POST", "/flows/f1/ai/messages", { text: "" })).status).toBe(400);
  });

  test("a model failure mid-stream becomes an error event and a stored error part", async () => {
    const model: LanguageModel = async () => {
      throw new (await import("@automator/flow-engine")).LanguageModelError("upstream", "boom");
    };
    const { call, messages } = fixture(model);
    const events = await readEvents(await call("POST", "/flows/f1/ai/messages", { text: "hi" }));
    expect(events.at(-2)).toEqual({ type: "error", error: "unavailable" });
    expect(events.at(-1)).toEqual({ type: "done" });
    expect(messages.rows.get("f1")![1]!.parts).toEqual([{ type: "error", error: "unavailable" }]);
  });
});
