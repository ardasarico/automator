import { describe, expect, test } from "bun:test";
import { explainRunContract, generateFlowContract, parseResponse } from "@automator/contracts";
import { scriptedModel, type LanguageModel } from "@automator/flow-engine";
import { Elysia } from "elysia";
import type { IdentityProvider } from "../auth/privy";
import { createAiRoutes } from "./routes";

const identity: IdentityProvider = {
  verify: async (token) => (token === "alice" ? { id: "did:privy:alice", expiresAt: 2e9 } : null),
  walletAddress: async () => null,
};

const answer = {
  name: "Ping",
  description: "",
  summary: "Manual run posts to Discord.",
  nodes: [
    { id: "n1", type: "trigger.manual", label: "Run", config: {} },
    { id: "n2", type: "notify.discord", label: "Post", config: { content: "hi" } },
  ],
  edges: [{ source: "n1", sourceHandle: "run", target: "n2", targetHandle: "message" }],
};

function fixture(model: LanguageModel | undefined, callsPerMinute?: number) {
  const app = new Elysia().use(createAiRoutes({ identity, model, callsPerMinute }));
  const post = (body: unknown, token?: string, path: string = generateFlowContract.path) =>
    app.handle(
      new Request(`http://localhost${path}`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }),
    );
  return { post };
}

describe("POST /ai/flows", () => {
  test("requires a token, then a prompt", async () => {
    const { post } = fixture(scriptedModel([]).model);
    expect((await post({ prompt: "x" })).status).toBe(401);
    expect((await post({}, "alice")).status).toBe(400);
  });

  test("answers 503 without a configured model", async () => {
    const { post } = fixture(undefined);
    const response = await post({ prompt: "x" }, "alice");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
  });

  test("requests beyond the per-user limit answer 429 before the handler runs", async () => {
    const { post } = fixture(undefined, 1);
    expect((await post({ prompt: "x" }, "alice")).status).toBe(503);
    const limited = await post({ prompt: "x" }, "alice");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect(await limited.json()).toEqual({ error: "rate_limited" });
    expect((await post({ prompt: "x" })).status).toBe(401);
  });

  test("returns a contract-valid generated document", async () => {
    const { post } = fixture(
      scriptedModel([{ content: JSON.stringify(answer), toolCalls: [] }]).model,
    );
    const response = await post({ prompt: "post to discord when I run it" }, "alice");
    expect(response.status).toBe(200);
    const result = parseResponse(generateFlowContract, 200, await response.json());
    if (result.status !== 200 || result.data.kind !== "flow")
      throw new Error("expected a document");
    expect(result.data.summary).toBe("Manual run posts to Discord.");
    expect(result.data.document.nodes.map((node) => node.type)).toEqual([
      "trigger.manual",
      "notify.discord",
    ]);
  });

  test("relays a message answer and the history to the model", async () => {
    const scripted = scriptedModel([
      { content: JSON.stringify({ message: "Which channel?" }), toolCalls: [] },
    ]);
    const { post } = fixture(scripted.model);
    const response = await post(
      { prompt: "post it", history: [{ role: "user", text: "make a flow" }] },
      "alice",
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ kind: "message", text: "Which channel?" });
    expect(scripted.requests[0]!.messages[1]).toEqual({ role: "user", content: "make a flow" });
  });

  test("blanks the document's secret fields before the model sees them", async () => {
    const scripted = scriptedModel([{ content: JSON.stringify(answer), toolCalls: [] }]);
    const { post } = fixture(scripted.model);
    const response = await post(
      {
        prompt: "say hello instead",
        document: {
          version: 1,
          name: "Ping",
          description: "",
          nodes: [
            {
              id: "n1",
              type: "trigger.manual",
              position: { x: 0, y: 0 },
              label: "Run",
              config: {},
            },
            {
              id: "n2",
              type: "notify.discord",
              position: { x: 300, y: 0 },
              label: "Post",
              config: { webhookUrl: "https://discord.com/api/webhooks/1/abc", content: "hi" },
            },
          ],
          edges: [
            { id: "e", source: "n1", sourceHandle: "run", target: "n2", targetHandle: "message" },
          ],
        },
      },
      "alice",
    );
    expect(response.status).toBe(200);
    expect(JSON.stringify(scripted.requests)).not.toContain("discord.com/api/webhooks");
  });

  test("answers 422 when the model cannot produce a valid flow", async () => {
    const bad = { content: JSON.stringify({ ...answer, edges: [] }), toolCalls: [] };
    const { post } = fixture(scriptedModel([bad, bad]).model);
    const response = await post({ prompt: "x" }, "alice");
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "invalid_flow" });
  });
});

describe("POST /ai/runs/explain", () => {
  const body = {
    document: {
      version: 1,
      name: "Ping",
      description: "",
      nodes: [
        { id: "n1", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Run", config: {} },
      ],
      edges: [],
    },
    run: {
      status: "failed",
      trigger: { nodeId: "n1" },
      nodes: [{ nodeId: "n1", status: "failed", error: "boom" }],
    },
  };

  test("requires a token and a complete body, and a model", async () => {
    const { post } = fixture(scriptedModel([]).model);
    expect((await post(body, undefined, explainRunContract.path)).status).toBe(401);
    expect((await post({ run: body.run }, "alice", explainRunContract.path)).status).toBe(400);
    const { post: postWithoutModel } = fixture(undefined);
    expect((await postWithoutModel(body, "alice", explainRunContract.path)).status).toBe(503);
  });

  test("answers with a contract-valid explanation", async () => {
    const { post } = fixture(
      scriptedModel([{ content: JSON.stringify({ message: "It broke." }), toolCalls: [] }]).model,
    );
    const response = await post(body, "alice", explainRunContract.path);
    expect(response.status).toBe(200);
    const result = parseResponse(explainRunContract, 200, await response.json());
    expect(result.data).toEqual({ kind: "message", text: "It broke." });
  });

  test("answers 422 when the model proposes an invalid fix twice", async () => {
    const bad = { content: JSON.stringify({ ...answer, edges: [] }), toolCalls: [] };
    const { post } = fixture(scriptedModel([bad, bad]).model);
    const response = await post(body, "alice", explainRunContract.path);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "invalid_flow" });
  });
});
