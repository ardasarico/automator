import {
  LanguageModelError,
  type ChatMessage,
  type ChatRequest,
  type LanguageModel,
  type ToolCall,
} from "@automator/flow-engine";

export interface OpenRouterOptions {
  apiKey: string | undefined;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
  /** Sent as the referer and title OpenRouter shows in its dashboard. */
  appUrl?: string;
}

export interface OpenAiOptions {
  apiKey: string | undefined;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

const openRouterBaseUrl = "https://openrouter.ai/api/v1";
const openAiBaseUrl = "https://api.openai.com/v1";

// OpenRouter tries these in order on upstream errors, within our single request timeout.
// The free router also covers catalog churn without ever selecting a paid model.
const freeFallbacks = ["nvidia/nemotron-3-super-120b-a12b:free", "google/gemma-4-31b-it:free"];

/** OpenAI-style wire shapes, only the fields this client reads or writes. */
interface WireToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
interface WireMessage {
  role: ChatMessage["role"];
  content: string | null;
  tool_calls?: WireToolCall[];
  tool_call_id?: string;
}
interface WireCompletion {
  choices?: { message?: WireMessage }[];
  error?: { message?: string };
}

function toWire(message: ChatMessage): WireMessage {
  const wire: WireMessage = { role: message.role, content: message.content };
  if (message.toolCalls?.length)
    wire.tool_calls = message.toolCalls.map((call) => ({
      id: call.id,
      type: "function",
      function: { name: call.name, arguments: JSON.stringify(call.arguments) },
    }));
  if (message.toolCallId) wire.tool_call_id = message.toolCallId;
  return wire;
}

function fromWire(call: WireToolCall): ToolCall {
  let parsed: unknown;
  try {
    parsed = call.function.arguments ? JSON.parse(call.function.arguments) : {};
  } catch {
    throw new LanguageModelError("invalid_response", "The model sent unreadable tool arguments");
  }
  const args =
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  return { id: call.id, name: call.function.name, arguments: args };
}

function responseFormat(format: ChatRequest["responseFormat"]) {
  if (!format) return undefined;
  if (format.type === "json_object") return { type: "json_object" };
  return {
    type: "json_schema",
    json_schema: { name: format.name, strict: false, schema: format.schema },
  };
}

/** The OpenRouter body picks a free router when the model is free; OpenAI takes the id as is. */
function modelSelection(provider: "OpenRouter" | "OpenAI", model: string) {
  if (provider === "OpenRouter" && (model.endsWith(":free") || model === "openrouter/free"))
    return {
      models: [
        ...[...new Set([model, ...freeFallbacks])]
          .filter((candidate) => candidate !== "openrouter/free")
          .slice(0, 2),
        "openrouter/free",
      ],
      provider: {
        require_parameters: true,
        max_price: { prompt: 0, completion: 0 },
      },
    };
  return { model };
}

interface ChatCompletionsOptions {
  provider: "OpenRouter" | "OpenAI";
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  fetcher: typeof fetch;
  headers?: Record<string, string>;
}

/**
 * A `LanguageModel` over OpenRouter's OpenAI-compatible chat completions. Returns `undefined`
 * without an API key, so callers can pass "no model" through unchanged. Failures become
 * `LanguageModelError`s by kind; the upstream message never reaches API clients.
 */
export function createOpenRouterModel({
  apiKey,
  model,
  baseUrl = openRouterBaseUrl,
  timeoutMs = 60_000,
  fetcher = fetch,
  appUrl,
}: OpenRouterOptions): LanguageModel | undefined {
  if (!apiKey) return undefined;
  return createChatCompletionsModel({
    provider: "OpenRouter",
    apiKey,
    model,
    baseUrl,
    timeoutMs,
    fetcher,
    headers: appUrl ? { "HTTP-Referer": appUrl, "X-Title": "Automator" } : undefined,
  });
}

/**
 * The same `LanguageModel` over OpenAI's own chat completions, for a paid fallback behind the
 * free OpenRouter models (see `withFallbackModel`). Absent without an API key.
 */
export function createOpenAiModel({
  apiKey,
  model,
  baseUrl = openAiBaseUrl,
  timeoutMs = 60_000,
  fetcher = fetch,
}: OpenAiOptions): LanguageModel | undefined {
  if (!apiKey) return undefined;
  return createChatCompletionsModel({
    provider: "OpenAI",
    apiKey,
    model,
    baseUrl,
    timeoutMs,
    fetcher,
  });
}

/**
 * Asks `fallback` when `primary` fails with a `LanguageModelError` of any kind: an unreachable
 * or erroring upstream, a timeout, or an unreadable answer. Anything else is a bug and passes
 * through. When both fail, the fallback's error is the one reported.
 */
export function withFallbackModel(
  primary: LanguageModel,
  fallback: LanguageModel,
  log?: (line: string) => void,
): LanguageModel {
  return async (request) => {
    try {
      return await primary(request);
    } catch (error) {
      if (!(error instanceof LanguageModelError)) throw error;
      log?.(`Primary model failed (${error.kind}: ${error.message}); asking the fallback`);
      return fallback(request);
    }
  };
}

function createChatCompletionsModel({
  provider,
  apiKey,
  model,
  baseUrl,
  timeoutMs,
  fetcher,
  headers,
}: ChatCompletionsOptions): LanguageModel {
  return async (request) => {
    const body = {
      ...modelSelection(provider, model),
      messages: request.messages.map(toWire),
      ...(request.tools?.length
        ? {
            tools: request.tools.map((tool) => ({
              type: "function",
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
              },
            })),
            tool_choice: "auto",
          }
        : {}),
      ...(request.responseFormat
        ? { response_format: responseFormat(request.responseFormat) }
        : {}),
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    };
    let response: Response;
    try {
      response = await fetcher(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      throw new LanguageModelError(
        timedOut ? "timeout" : "upstream",
        timedOut ? "The model did not answer in time" : "The model could not be reached",
      );
    }
    let payload: WireCompletion;
    try {
      payload = (await response.json()) as WireCompletion;
    } catch {
      throw new LanguageModelError(
        "invalid_response",
        "The model answered with no JSON",
        response.status,
      );
    }
    if (!response.ok)
      throw new LanguageModelError(
        "upstream",
        `${provider} answered ${response.status}${payload.error?.message ? `: ${payload.error.message}` : ""}`,
        response.status,
      );
    const message = payload.choices?.[0]?.message;
    if (!message)
      throw new LanguageModelError("invalid_response", "The model answered with no choices");
    return {
      content: message.content ?? null,
      toolCalls: (message.tool_calls ?? []).map(fromWire),
    };
  };
}
