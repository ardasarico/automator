import { describe, expect, test } from "bun:test";
import {
  explainRunContract,
  generateFlowContract,
  parseResponse,
  type DataTable,
} from "@automator/contracts";
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

const tables: DataTable[] = [
  {
    id: "tbl-signups",
    name: "Signups",
    columns: [{ id: "email", name: "Email", type: "text", required: true }],
    recordCount: 0,
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
  },
];

const dataTables = { list: async () => tables };

function dataAnswer(tableId: string) {
  return {
    name: "Collect",
    description: "",
    summary: "Stores the signup.",
    nodes: [
      { id: "n1", type: "trigger.manual", label: "Run", config: {} },
      {
        id: "n2",
        type: "data.create-record",
        label: "Save",
        config: { tableId, values: [{ column: "email", value: "a@b.co" }] },
      },
    ],
    edges: [{ source: "n1", sourceHandle: "run", target: "n2", targetHandle: "values" }],
  };
}

function fixture(
  model: LanguageModel | undefined,
  callsPerMinute?: number,
  stores?: { dataTables: typeof dataTables },
) {
  const app = new Elysia().use(createAiRoutes({ identity, model, callsPerMinute, ...stores }));
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

  test("the prompt lists the owner's tables and a node may reference one", async () => {
    const scripted = scriptedModel([
      { content: JSON.stringify(dataAnswer("tbl-signups")), toolCalls: [] },
    ]);
    const { post } = fixture(scripted.model, undefined, { dataTables });
    const response = await post({ prompt: "store the signup" }, "alice");
    expect(response.status).toBe(200);
    const prompt = scripted.requests[0]!.messages[0]!.content;
    expect(prompt).toContain('id "tbl-signups" named "Signups"');
    expect(prompt).toContain("email (text)");
    expect(prompt).toContain("Never invent a table id");
  });

  test("without any table the prompt forbids data nodes", async () => {
    const scripted = scriptedModel([{ content: JSON.stringify(answer), toolCalls: [] }]);
    const { post } = fixture(scripted.model, undefined, {
      dataTables: { list: async () => [] },
    });
    expect((await post({ prompt: "x" }, "alice")).status).toBe(200);
    expect(scripted.requests[0]!.messages[0]!.content).toContain(
      "no data tables, so you must not use any data.* node",
    );
  });

  test("a data node naming a table the owner does not have is rejected", async () => {
    const invented = { content: JSON.stringify(dataAnswer("tbl-invented")), toolCalls: [] };
    const { post } = fixture(scriptedModel([invented, invented]).model, undefined, { dataTables });
    const response = await post({ prompt: "store the signup" }, "alice");
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "invalid_flow" });
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
