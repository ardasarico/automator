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

/*
 * One model call's budget. A reasoning model spends most of it thinking before a byte of the
 * answer arrives: the configured openai/gpt-oss-120b was measured at 33s, 58s, 68s, 81s and 104s
 * on the same request, so the old 60s ceiling failed a clear majority of them — and, because the
 * budget expires while the body is still streaming, it failed them as "malformed JSON".
 *
 * The number comes from the guard in `client.test.ts`: the client gives up at
 * aiRequestTimeoutMs + 5s = 305s, and modelAttempts × (this + verificationBudgetMs) has to fit,
 * or the user waits the full five minutes and gets nothing — the worst outcome this feature has.
 * At 130 that ceiling is 280s, leaving 25s for the overhead none of these timers models, and 26s
 * of margin over the slowest answer yet measured. Raise it and the guard will tell you.
 */
export const modelTimeoutMs = 130_000;

/*
 * The budget for one /ai/flows request, end to end. `modelTimeoutMs` bounds a single call, but a
 * request is not a single call: `withFallbackModel` turns one `model(request)` into two hops, and
 * askForFlow makes up to `modelAttempts` of those, so multiplying per-call ceilings gives a worst
 * case of four hops plus checks — far past anything the browser will wait for. One wall-clock
 * deadline, shared by every hop and every check, makes the worst case equal to this number no
 * matter how the call graph grows. The browser gives up at aiRequestTimeoutMs + 5s = 305s; the
 * 20s left over covers the HTTP round trip and the work outside these timers.
 */
export const requestBudgetMs = 285_000;

const outOfTime = "The request ran out of time before the model answered";

/**
 * Binds a model to an instant it must answer by. The inner call keeps its own per-call timeout —
 * an abandoned one cannot outlive `modelTimeoutMs` — but nothing waits past the deadline, so a
 * slow primary can no longer spend the budget its own fallback needs.
 *
 * Only flow generation is wrapped. An ai.* node inside a run calls the model directly, so its
 * worst case is `modelTimeoutMs` per hop with nothing above it but the caller hanging up — and a
 * temperature retry makes that two hops. Harmless today (the retry costs one fast 400, once per
 * model) but it is the same arithmetic-versus-structure gap this wrapper exists to close, one
 * layer over in `runs/routes.ts`.
 */
export function withRequestDeadline(model: LanguageModel, deadlineAt: number): LanguageModel {
  return async (request) => {
    const left = deadlineAt - Date.now();
    if (left <= 0) throw new LanguageModelError("timeout", outOfTime);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expiry = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new LanguageModelError("timeout", outOfTime)), left);
    });
    try {
      return await Promise.race([model(request), expiry]);
    } finally {
      clearTimeout(timer);
    }
  };
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
  timeoutMs = modelTimeoutMs,
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
  timeoutMs = modelTimeoutMs,
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
    let body: Record<string, unknown> = {
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
    const send = async () => {
      try {
        return await fetcher(`${baseUrl}/chat/completions`, {
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
    };
    let response = await send();
    /*
     * Newer models accept only their default temperature and reject ours with a 400 — a request
     * shape we chose, not an answer they could not give. Asking again without it costs one round
     * trip on the first call to such a model and nothing afterwards, and it beats the alternative:
     * every request to that model failing in a way that reads like a quality problem.
     */
    if (response.status === 400 && body.temperature !== undefined) {
      const detail = await response
        .clone()
        .json()
        .then((payload: unknown) =>
          String((payload as { error?: { message?: unknown } })?.error?.message ?? ""),
        )
        .catch(() => "");
      if (/temperature/i.test(detail)) {
        const { temperature: _dropped, ...rest } = body;
        body = rest;
        response = await send();
      }
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      /*
       * The budget covers the body, not just the headers: OpenRouter answers immediately and
       * streams the completion last, so a slow model runs out of time here rather than at the
       * fetch. Calling that malformed JSON hides the one thing that would explain it.
       */
      if (error instanceof Error && error.name === "TimeoutError")
        throw new LanguageModelError("timeout", "The model did not answer in time");
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
