import type { FlowDocument, FlowEdge, FlowNode, FlowNodeType } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { runFlow } from "./engine";
import { scriptedModel, type ChatResponse } from "./language-model";

function node(id: string, type: FlowNodeType, config: Record<string, unknown> = {}): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, label: id, config };
}
function edge(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): FlowEdge {
  return { id: `${source}-${target}`, source, sourceHandle, target, targetHandle };
}
function flow(nodes: FlowNode[], edges: FlowEdge[]): FlowDocument {
  return { version: 1, id: "flow-1", name: "AI", description: "", nodes, edges };
}
const fixedNow = () => new Date("2026-09-07T10:00:00.000Z");
const text = (content: string): ChatResponse => ({ content, toolCalls: [] });

describe("AI executors", () => {
  test("generate-text sends instructions and the templated prompt", async () => {
    const { model, requests } = scriptedModel([text("A haiku.")]);
    const run = await runFlow(
      flow(
        [
          node("t", "trigger.manual"),
          node("g", "ai.generate-text", {
            instructions: "Be brief.",
            prompt: "Write about {{input.prompt.topic}}",
          }),
        ],
        [edge("t", "run", "g", "prompt")],
      ),
      { model, trigger: { payload: { topic: "rain" } }, now: fixedNow },
    );
    expect(run.status).toBe("succeeded");
    expect(run.nodes[1]!.outputs).toEqual({ text: "A haiku." });
    expect(requests[0]!.messages).toEqual([
      { role: "system", content: "Be brief." },
      { role: "user", content: "Write about rain" },
    ]);
  });

  test("AI nodes fail as unconfigured without a model", async () => {
    const run = await runFlow(
      flow(
        [node("t", "trigger.manual"), node("g", "ai.generate-text", { prompt: "x" })],
        [edge("t", "run", "g", "prompt")],
      ),
      { now: fixedNow },
    );
    expect(run.nodes[1]).toMatchObject({
      status: "failed",
      error: "No language model is configured; set OPENROUTER_API_KEY or OPENAI_API_KEY",
    });
  });

  test("classify constrains the answer to the labels and fires the label as a handle", async () => {
    const { model, requests } = scriptedModel([text('{"label":"refund"}')]);
    const run = await runFlow(
      flow(
        [
          node("t", "trigger.manual"),
          node("c", "ai.classify", { labels: ["refund", "question", " "], text: "{{input.text}}" }),
        ],
        [edge("t", "run", "c", "text")],
      ),
      { model, trigger: { payload: "I want my money back" }, now: fixedNow },
    );
    expect(run.nodes[1]!.outputs).toEqual({ label: "refund", refund: "I want my money back" });
    expect(requests[0]!.responseFormat).toEqual({
      type: "json_schema",
      name: "classification",
      schema: {
        type: "object",
        properties: { label: { type: "string", enum: ["refund", "question"] } },
        required: ["label"],
        additionalProperties: false,
      },
    });
  });

  test("classify rejects a label outside the set", async () => {
    const { model } = scriptedModel([text('{"label":"other"}')]);
    const run = await runFlow(
      flow(
        [node("t", "trigger.manual"), node("c", "ai.classify", { labels: ["a", "b"] })],
        [edge("t", "run", "c", "text")],
      ),
      { model, now: fixedNow },
    );
    expect(run.nodes[1]).toMatchObject({
      status: "failed",
      error: "The model answered with an unknown label: other",
    });
  });

  test("the classification named label cannot overwrite the label output", async () => {
    const { model } = scriptedModel([text('{"label":"label"}')]);
    const run = await runFlow(
      flow(
        [node("t", "trigger.manual"), node("c", "ai.classify", { labels: ["label"] })],
        [edge("t", "run", "c", "text")],
      ),
      { model, trigger: { payload: "Input content" } },
    );
    expect(run.nodes[1]?.outputs).toEqual({ label: "label" });
  });

  test("extract checks the answer against the schema, tolerating a code fence", async () => {
    const schema = JSON.stringify({
      type: "object",
      properties: { amount: { type: "number" }, currency: { type: "string" } },
      required: ["amount", "currency"],
    });
    const good = scriptedModel([text('```json\n{"amount": 12.5, "currency": "USDC"}\n```')]);
    const run = await runFlow(
      flow(
        [node("t", "trigger.manual"), node("x", "ai.extract", { schema })],
        [edge("t", "run", "x", "text")],
      ),
      { model: good.model, trigger: { payload: "Send 12.5 USDC" }, now: fixedNow },
    );
    expect(run.nodes[1]!.outputs).toEqual({ data: { amount: 12.5, currency: "USDC" } });

    const bad = scriptedModel([text('{"amount": "twelve"}')]);
    const failed = await runFlow(
      flow(
        [node("t", "trigger.manual"), node("x", "ai.extract", { schema })],
        [edge("t", "run", "x", "text")],
      ),
      { model: bad.model, now: fixedNow },
    );
    expect(failed.nodes[1]).toMatchObject({
      status: "failed",
      error: "The model's answer does not match the schema",
    });
  });
});

describe("AI agent", () => {
  const webhook = "https://discord.com/api/webhooks/1/abc";

  test("runs tool calls in order, logs each step, and returns the final answer", async () => {
    const { model, requests } = scriptedModel([
      {
        content: null,
        toolCalls: [
          { id: "c1", name: "http_get", arguments: { url: "https://api.example.com/price" } },
        ],
      },
      {
        content: null,
        toolCalls: [
          { id: "c2", name: "set_variable", arguments: { name: "price", value: "42" } },
          { id: "c3", name: "discord_message", arguments: { content: "Price is 42" } },
        ],
      },
      text("Done: price 42 posted."),
    ]);
    const fetched: string[] = [];
    const run = await runFlow(
      flow(
        [
          node("t", "trigger.manual"),
          node("a", "ai.agent", {
            task: "Check the price and post it",
            tools: ["http_get", "set_variable", "discord_message"],
            allowedHosts: ["example.com"],
            discordWebhookUrl: webhook,
            maxSteps: 5,
          }),
        ],
        [edge("t", "run", "a", "prompt")],
      ),
      {
        model,
        now: fixedNow,
        fetch: (async (input: string | URL | Request, init?: RequestInit) => {
          fetched.push(`${init?.method ?? "GET"} ${String(input)}`);
          return String(input).includes("discord")
            ? Response.json({ id: "m9", channel_id: "c" })
            : new Response('{"price":42}', { status: 200 });
        }) as typeof fetch,
      },
    );
    expect(run.status).toBe("succeeded");
    expect(run.variables).toEqual({ price: "42" });
    expect(fetched).toEqual(["GET https://api.example.com/price", `POST ${webhook}?wait=true`]);
    expect(run.nodes[1]!.outputs).toEqual({
      result: "Done: price 42 posted.",
      steps: [
        {
          step: 1,
          tool: "http_get",
          arguments: { url: "https://api.example.com/price" },
          result: 'HTTP 200\n{"price":42}',
        },
        {
          step: 2,
          tool: "set_variable",
          arguments: { name: "price", value: "42" },
          result: "Set price",
        },
        {
          step: 2,
          tool: "discord_message",
          arguments: { content: "Price is 42" },
          result: "Posted message m9",
        },
      ],
    });
    // The model only ever sees the allowed tools, and gets each tool result back by call id.
    expect(requests[0]!.tools?.map((tool) => tool.name)).toEqual([
      "http_get",
      "set_variable",
      "discord_message",
    ]);
    expect(requests[1]!.messages.at(-1)).toEqual({
      role: "tool",
      content: 'HTTP 200\n{"price":42}',
      toolCallId: "c1",
    });
  });

  test("refuses tools outside the config and hosts outside the allowlist, telling the model", async () => {
    const { model, requests } = scriptedModel([
      {
        content: null,
        toolCalls: [
          { id: "c1", name: "discord_message", arguments: { content: "hi" } },
          { id: "c2", name: "http_get", arguments: { url: "https://evil.example/x" } },
        ],
      },
      text("I could not do that."),
    ]);
    const run = await runFlow(
      flow(
        [
          node("t", "trigger.manual"),
          node("a", "ai.agent", {
            task: "x",
            tools: ["http_get"],
            allowedHosts: ["api.example.com"],
          }),
        ],
        [edge("t", "run", "a", "prompt")],
      ),
      {
        model,
        now: fixedNow,
        fetch: (async () => new Response("nope")) as unknown as typeof fetch,
      },
    );
    expect(run.status).toBe("succeeded");
    expect(run.nodes[1]!.outputs).toEqual({
      result: "I could not do that.",
      steps: [
        {
          step: 1,
          tool: "discord_message",
          arguments: { content: "hi" },
          result: 'Tool "discord_message" is not allowed',
          error: true,
        },
        {
          step: 1,
          tool: "http_get",
          arguments: { url: "https://evil.example/x" },
          result: 'Host "evil.example" is not allowed',
          error: true,
        },
      ],
    });
    expect(requests[0]!.tools?.map((tool) => tool.name)).toEqual(["http_get"]);
  });

  test("stops a runaway agent at maxSteps", async () => {
    const call: ChatResponse = {
      content: null,
      toolCalls: [{ id: "c", name: "set_variable", arguments: { name: "n", value: "1" } }],
    };
    const { model } = scriptedModel([call, call, call]);
    const run = await runFlow(
      flow(
        [
          node("t", "trigger.manual"),
          node("a", "ai.agent", { task: "loop", tools: ["set_variable"], maxSteps: 2 }),
        ],
        [edge("t", "run", "a", "prompt")],
      ),
      { model, now: fixedNow },
    );
    expect(run.nodes[1]).toMatchObject({
      status: "failed",
      error: "AI agent stopped after 2 steps without a final answer",
    });
    expect(run.nodes[1]?.outputs?.steps).toHaveLength(2);
  });

  test.each(["model failure", "cancellation"])(
    "retains completed tool deliveries after %s without firing downstream edges",
    async (failure) => {
      const controller = new AbortController();
      let turns = 0;
      let deliveries = 0;
      const run = await runFlow(
        flow(
          [
            node("t", "trigger.manual"),
            node("a", "ai.agent", {
              task: "Post",
              tools: ["discord_message"],
              discordWebhookUrl: webhook,
            }),
            node("after", "logic.set-variable", { name: "ran", value: "yes" }),
          ],
          [edge("t", "run", "a", "prompt"), edge("a", "steps", "after", "value")],
        ),
        {
          signal: controller.signal,
          model: async () => {
            turns += 1;
            if (turns === 1)
              return {
                content: null,
                toolCalls: [
                  { id: "c1", name: "discord_message", arguments: { content: "Sent once" } },
                ],
              };
            if (failure === "cancellation") controller.abort();
            throw new Error("Model unavailable");
          },
          fetch: (async () => {
            deliveries += 1;
            return Response.json({ id: "m1" });
          }) as unknown as typeof fetch,
        },
      );
      expect(run.status).toBe("failed");
      expect(deliveries).toBe(1);
      expect(run.nodes[1]?.outputs?.steps).toMatchObject([
        { tool: "discord_message", result: "Posted message m1" },
      ]);
      expect(run.nodes[2]?.status).toBe("skipped");
    },
  );

  test("does not follow a redirect outside the configured host allowlist", async () => {
    const { model } = scriptedModel([
      {
        content: null,
        toolCalls: [
          { id: "c", name: "http_get", arguments: { url: "https://api.example.com/redirect" } },
        ],
      },
      text("Could not fetch the redirect."),
    ]);
    const fetched: RequestInit[] = [];
    const run = await runFlow(
      flow(
        [
          node("t", "trigger.manual"),
          node("a", "ai.agent", {
            task: "Fetch a page",
            tools: ["http_get"],
            allowedHosts: ["api.example.com"],
          }),
        ],
        [edge("t", "run", "a", "prompt")],
      ),
      {
        model,
        fetch: (async (_input: unknown, init: RequestInit) => {
          fetched.push(init);
          return new Response(null, {
            status: 302,
            headers: { Location: "https://outside.example/private" },
          });
        }) as typeof fetch,
      },
    );
    expect(fetched).toHaveLength(1);
    expect(fetched[0]?.redirect).toBe("manual");
    expect(run.nodes[1]?.outputs?.steps).toMatchObject([
      { tool: "http_get", error: true, result: "HTTP redirects are not allowed" },
    ]);
  });
});
