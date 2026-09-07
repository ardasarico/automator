import { LanguageModelError } from "@automator/flow-engine";
import { describe, expect, test } from "bun:test";
import { createOpenRouterModel } from "./client";

type Call = { url: string; headers: Headers; body: Record<string, unknown> };

function fixture(answer: () => Promise<Response>) {
  const calls: Call[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    });
    return answer();
  }) as unknown as typeof fetch;
  const model = createOpenRouterModel({ apiKey: "sk-test", model: "openai/gpt-4o-mini", fetcher })!;
  return { model, calls };
}

describe("OpenRouter client", () => {
  test("is absent without an API key", () => {
    expect(createOpenRouterModel({ apiKey: undefined, model: "m" })).toBeUndefined();
  });

  test("sends an OpenAI-style completion request and reads text and tool calls back", async () => {
    const { model, calls } = fixture(async () =>
      Response.json({
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "c1",
                  type: "function",
                  function: { name: "http_get", arguments: '{"url":"https://a.b"}' },
                },
              ],
            },
          },
        ],
      }),
    );
    const answer = await model({
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "hi" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "c0", name: "set_variable", arguments: { name: "x", value: "1" } }],
        },
        { role: "tool", content: "Set x", toolCallId: "c0" },
      ],
      tools: [{ name: "http_get", description: "d", parameters: { type: "object" } }],
      responseFormat: { type: "json_schema", name: "s", schema: { type: "object" } },
      temperature: 0,
    });
    expect(answer).toEqual({
      content: null,
      toolCalls: [{ id: "c1", name: "http_get", arguments: { url: "https://a.b" } }],
    });
    const call = calls[0]!;
    expect(call.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(call.headers.get("authorization")).toBe("Bearer sk-test");
    expect(call.body).toEqual({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "hi" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "c0",
              type: "function",
              function: { name: "set_variable", arguments: '{"name":"x","value":"1"}' },
            },
          ],
        },
        { role: "tool", content: "Set x", tool_call_id: "c0" },
      ],
      tools: [
        {
          type: "function",
          function: { name: "http_get", description: "d", parameters: { type: "object" } },
        },
      ],
      tool_choice: "auto",
      response_format: {
        type: "json_schema",
        json_schema: { name: "s", strict: false, schema: { type: "object" } },
      },
      temperature: 0,
    });
  });

  test("maps failures to error kinds", async () => {
    const kinds = async (answer: () => Promise<Response>) => {
      const { model } = fixture(answer);
      try {
        await model({ messages: [{ role: "user", content: "x" }] });
      } catch (error) {
        return error instanceof LanguageModelError ? [error.kind, error.status] : ["other"];
      }
      return ["none"];
    };
    expect(
      await kinds(async () => Response.json({ error: { message: "bad key" } }, { status: 401 })),
    ).toEqual(["upstream", 401]);
    expect(await kinds(async () => new Response("<html>", { status: 502 }))).toEqual([
      "invalid_response",
      502,
    ]);
    expect(await kinds(async () => Response.json({ choices: [] }))).toEqual([
      "invalid_response",
      undefined,
    ]);
    expect(
      await kinds(async () => {
        throw new Error("ECONNREFUSED");
      }),
    ).toEqual(["upstream", undefined]);
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    expect(
      await kinds(async () => {
        throw timeout;
      }),
    ).toEqual(["timeout", undefined]);
  });
});
