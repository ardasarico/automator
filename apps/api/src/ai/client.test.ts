import { LanguageModelError } from "@automator/flow-engine";
import { describe, expect, test } from "bun:test";
import { createOpenAiModel, createOpenRouterModel, withFallbackModel } from "./client";

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
  test.each([
    "minimax/minimax-m3:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "openrouter/free",
  ])(
    "%s routes through at most three distinct free models with a zero price ceiling",
    async (primary) => {
      let body: Record<string, unknown> = {};
      const model = createOpenRouterModel({
        apiKey: "sk-test",
        model: primary,
        fetcher: (async (_url, init) => {
          body = JSON.parse(String(init?.body));
          return Response.json({ choices: [{ message: { content: "ok" } }] });
        }) as typeof fetch,
      })!;
      expect(await model({ messages: [{ role: "user", content: "hi" }] })).toEqual({
        content: "ok",
        toolCalls: [],
      });
      const models = body.models as string[];
      expect(models.length).toBeLessThanOrEqual(3);
      expect(new Set(models).size).toBe(models.length);
      expect(models.every((id) => id.endsWith(":free") || id === "openrouter/free")).toBe(true);
      if (primary !== "openrouter/free") expect(models[0]).toBe(primary);
      expect(models.at(-1)).toBe("openrouter/free");
      expect(body.provider).toEqual({
        require_parameters: true,
        max_price: { prompt: 0, completion: 0 },
      });
      expect(body.model).toBeUndefined();
    },
  );

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

  test.each([
    ["null payload", null],
    ["non-array choices", { choices: { 0: { message: { content: "ok" } } } }],
    ["missing message", { choices: [{}] }],
    ["non-text content", { choices: [{ message: { content: { answer: "ok" } } }] }],
    ["empty message", { choices: [{ message: {} }] }],
    ["non-array tool calls", { choices: [{ message: { content: null, tool_calls: {} } }] }],
    ["malformed tool call", { choices: [{ message: { tool_calls: [null] } }] }],
    ...["null", "[]", "42", '"text"', "not json"].map<[string, unknown]>((args) => [
      `invalid tool arguments ${args}`,
      {
        choices: [
          {
            message: {
              tool_calls: [
                { id: "call", type: "function", function: { name: "http_get", arguments: args } },
              ],
            },
          },
        ],
      },
    ]),
  ])("classifies %s as a provider failure and allows fallback", async (_name, payload) => {
    const { model } = fixture(async () => Response.json(payload));
    const request = { messages: [{ role: "user" as const, content: "hello" }] };
    await expect(model(request)).rejects.toMatchObject({ kind: "invalid_response" });
    let fallbackCalls = 0;
    const fallback = withFallbackModel(model, async () => {
      fallbackCalls++;
      return { content: "recovered", toolCalls: [] };
    });
    expect(await fallback(request)).toEqual({ content: "recovered", toolCalls: [] });
    expect(fallbackCalls).toBe(1);
  });

  test("preserves the upstream status when its error payload is null", async () => {
    const { model } = fixture(async () => Response.json(null, { status: 503 }));
    await expect(model({ messages: [] })).rejects.toMatchObject({
      kind: "upstream",
      status: 503,
    });
  });

  test("refuses duplicate tool call ids before any tool is run", async () => {
    const call = { id: "same", type: "function", function: { name: "http_get", arguments: "{}" } };
    const { model } = fixture(async () =>
      Response.json({ choices: [{ message: { content: null, tool_calls: [call, call] } }] }),
    );
    await expect(model({ messages: [] })).rejects.toMatchObject({ kind: "invalid_response" });
  });
});

describe("OpenAI client", () => {
  test("is absent without an API key", () => {
    expect(createOpenAiModel({ apiKey: undefined, model: "gpt-4.1-mini" })).toBeUndefined();
  });

  test("sends the same completion request to OpenAI without OpenRouter headers", async () => {
    const calls: Call[] = [];
    const model = createOpenAiModel({
      apiKey: "sk-openai",
      model: "gpt-4.1-mini",
      fetcher: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: String(url),
          headers: new Headers(init?.headers),
          body: JSON.parse(String(init?.body)),
        });
        return Response.json({ choices: [{ message: { content: "ok" } }] });
      }) as unknown as typeof fetch,
    })!;
    expect(await model({ messages: [{ role: "user", content: "hi" }], temperature: 0 })).toEqual({
      content: "ok",
      toolCalls: [],
    });
    const call = calls[0]!;
    expect(call.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(call.headers.get("authorization")).toBe("Bearer sk-openai");
    expect(call.headers.get("http-referer")).toBeNull();
    expect(call.body).toEqual({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: "hi" }],
      temperature: 0,
    });
  });

  test("names OpenAI in upstream failures", async () => {
    const model = createOpenAiModel({
      apiKey: "sk-openai",
      model: "gpt-4.1-mini",
      fetcher: (async (_url: string | URL | Request) =>
        Response.json({ error: { message: "quota" } }, { status: 429 })) as typeof fetch,
    })!;
    await expect(model({ messages: [{ role: "user", content: "x" }] })).rejects.toMatchObject({
      kind: "upstream",
      status: 429,
      message: "OpenAI answered 429: quota",
    });
  });
});

describe("withFallbackModel", () => {
  const request = { messages: [{ role: "user" as const, content: "hi" }] };
  const answer = (content: string) => async () => ({ content, toolCalls: [] });

  test("answers from the primary model when it works", async () => {
    let fallbackCalls = 0;
    const model = withFallbackModel(answer("primary"), async () => {
      fallbackCalls++;
      return { content: "fallback", toolCalls: [] };
    });
    expect(await model(request)).toEqual({ content: "primary", toolCalls: [] });
    expect(fallbackCalls).toBe(0);
  });

  test.each(["upstream", "timeout", "invalid_response"] as const)(
    "asks the fallback when the primary fails with %s",
    async (kind) => {
      const model = withFallbackModel(async () => {
        throw new LanguageModelError(kind, "primary broke");
      }, answer("fallback"));
      expect(await model(request)).toEqual({ content: "fallback", toolCalls: [] });
    },
  );

  test("reports the fallback's failure when both fail", async () => {
    const model = withFallbackModel(
      async () => {
        throw new LanguageModelError("upstream", "primary broke");
      },
      async () => {
        throw new LanguageModelError("timeout", "fallback broke");
      },
    );
    await expect(model(request)).rejects.toMatchObject({
      kind: "timeout",
      message: "fallback broke",
    });
  });

  test("lets unexpected errors through without asking the fallback", async () => {
    let fallbackCalls = 0;
    const model = withFallbackModel(
      async () => {
        throw new TypeError("bug");
      },
      async () => {
        fallbackCalls++;
        return { content: "fallback", toolCalls: [] };
      },
    );
    await expect(model(request)).rejects.toBeInstanceOf(TypeError);
    expect(fallbackCalls).toBe(0);
  });
});
