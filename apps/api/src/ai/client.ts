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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fromWire(call: unknown): ToolCall {
  if (
    !isRecord(call) ||
    typeof call.id !== "string" ||
    !call.id.trim() ||
    call.type !== "function" ||
    !isRecord(call.function) ||
    typeof call.function.name !== "string" ||
    !call.function.name.trim() ||
    typeof call.function.arguments !== "string"
  )
    throw new LanguageModelError("invalid_response", "The model sent an invalid tool call");
  let parsed: unknown;
  try {
    parsed = call.function.arguments ? JSON.parse(call.function.arguments) : {};
  } catch {
    throw new LanguageModelError("invalid_response", "The model sent unreadable tool arguments");
  }
  if (!isRecord(parsed))
    throw new LanguageModelError("invalid_response", "The model sent non-object tool arguments");
  return { id: call.id, name: call.function.name, arguments: parsed };
}

function responseFormat(format: ChatRequest["responseFormat"]) {
  if (!format) return undefined;
  if (format.type === "json_object") return { type: "json_object" };
  return {
    type: "json_schema",
    json_schema: { name: format.name, strict: false, schema: format.schema },
  };
}

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
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new LanguageModelError(
        "invalid_response",
        "The model answered with no JSON",
        response.status,
      );
    }
    if (!response.ok) {
      const detail =
        isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string"
          ? payload.error.message
          : undefined;
      throw new LanguageModelError(
        "upstream",
        `${provider} answered ${response.status}${detail ? `: ${detail}` : ""}`,
        response.status,
      );
    }
    const choice = isRecord(payload) && Array.isArray(payload.choices) ? payload.choices[0] : null;
    const message = isRecord(choice) ? choice.message : null;
    if (!isRecord(message))
      throw new LanguageModelError("invalid_response", "The model answered with no choices");
    if (message.content != null && typeof message.content !== "string")
      throw new LanguageModelError("invalid_response", "The model sent invalid message content");
    if (message.tool_calls != null && !Array.isArray(message.tool_calls))
      throw new LanguageModelError("invalid_response", "The model sent invalid tool calls");
    const toolCalls = (message.tool_calls ?? []).map(fromWire);
    if (new Set(toolCalls.map((call) => call.id)).size !== toolCalls.length)
      throw new LanguageModelError("invalid_response", "The model sent duplicate tool call ids");
    if (!message.content && toolCalls.length === 0)
      throw new LanguageModelError("invalid_response", "The model answered with no content");
    return {
      content: message.content ?? null,
      toolCalls,
    };
  };
}
