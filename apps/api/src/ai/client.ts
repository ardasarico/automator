import {
  LanguageModelError,
  type ChatMessage,
  type ChatRequest,
  type ChatResponse,
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
    /*
     * The losing call keeps streaming to its own timeout, and the turn it was speaking for has
     * already moved on — a late delta would be pasted into someone else's text. Once the race
     * is settled, either way, nothing it says is forwarded.
     */
    let settled = false;
    const heard = request.onText;
    const bounded: ChatRequest = heard
      ? {
          ...request,
          onText: (delta) => {
            if (!settled) heard(delta);
          },
        }
      : request;
    try {
      return await Promise.race([model(bounded), expiry]);
    } finally {
      settled = true;
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

interface StreamedCall {
  id: string;
  type: string;
  name: string;
  arguments: string;
}

/**
 * Reads an OpenAI-style streamed completion: `data:` lines separated by blank lines, `[DONE]`
 * last. Content reaches the caller delta by delta, which is the point; tool calls are assembled
 * by their `index`, since only the first chunk of a call carries its id and name, and then pass
 * through the same `fromWire` as a whole answer so an invalid one fails identically. A stream
 * that ends without `[DONE]` is still an answer: what arrived is what the model said.
 */
async function readStreamedAnswer(
  response: Response,
  onText: (delta: string) => void,
): Promise<ChatResponse> {
  const calls = new Map<number, StreamedCall>();
  let content = "";
  let done = false;

  const take = (event: string) => {
    for (const line of event.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data) continue;
      if (data === "[DONE]") {
        done = true;
        return;
      }
      let chunk: unknown;
      try {
        chunk = JSON.parse(data);
      } catch {
        throw new LanguageModelError("invalid_response", "The model sent an unreadable chunk");
      }
      const choice = isRecord(chunk) && Array.isArray(chunk.choices) ? chunk.choices[0] : null;
      const delta = isRecord(choice) ? choice.delta : null;
      if (!isRecord(delta)) continue;
      if (typeof delta.content === "string" && delta.content) {
        content += delta.content;
        onText(delta.content);
      }
      if (!Array.isArray(delta.tool_calls)) continue;
      for (const raw of delta.tool_calls) {
        if (!isRecord(raw)) continue;
        const index = typeof raw.index === "number" ? raw.index : calls.size;
        const call = calls.get(index) ?? { id: "", type: "function", name: "", arguments: "" };
        if (typeof raw.id === "string") call.id = raw.id;
        if (typeof raw.type === "string") call.type = raw.type;
        if (isRecord(raw.function)) {
          // Appended, not assigned: a provider may split either field across chunks.
          if (typeof raw.function.name === "string") call.name += raw.function.name;
          if (typeof raw.function.arguments === "string") call.arguments += raw.function.arguments;
        }
        calls.set(index, call);
      }
    }
  };

  const reader = response.body?.getReader();
  if (!reader)
    throw new LanguageModelError("invalid_response", "The model answered with no content");
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (!done) {
      const chunk = await reader.read();
      if (chunk.done) {
        take(buffer + decoder.decode());
        break;
      }
      buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, "\n");
      let end = buffer.indexOf("\n\n");
      while (end !== -1 && !done) {
        take(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        end = buffer.indexOf("\n\n");
      }
    }
  } catch (error) {
    if (error instanceof LanguageModelError) throw error;
    /* The per-call budget covers this read, so it expires here rather than at the fetch. */
    const timedOut =
      error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new LanguageModelError(
      timedOut ? "timeout" : "upstream",
      timedOut ? "The model did not answer in time" : "The model could not be reached",
    );
  } finally {
    await reader.cancel().catch(() => {});
  }

  const toolCalls = [...calls.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, call]) =>
      fromWire({
        id: call.id,
        type: call.type,
        function: { name: call.name, arguments: call.arguments },
      }),
    );
  if (new Set(toolCalls.map((call) => call.id)).size !== toolCalls.length)
    throw new LanguageModelError("invalid_response", "The model sent duplicate tool call ids");
  if (!content && toolCalls.length === 0)
    throw new LanguageModelError("invalid_response", "The model answered with no content");
  return { content: content || null, toolCalls };
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
    /*
     * Text already delivered cannot be taken back. The fallback answers for a primary that is
     * down — one that fails before saying a word — but a primary that breaks mid-stream has
     * already written part of the turn, and a second whole answer would be pasted onto it.
     */
    let spoke = false;
    const heard = request.onText;
    const watched: ChatRequest = heard
      ? {
          ...request,
          onText: (delta) => {
            spoke = true;
            heard(delta);
          },
        }
      : request;
    try {
      return await primary(watched);
    } catch (error) {
      if (!(error instanceof LanguageModelError)) throw error;
      if (spoke) {
        log?.(
          `Primary model failed after streaming (${error.kind}: ${error.message}); keeping its text`,
        );
        throw error;
      }
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
            /*
             * OpenAI's chat-completions endpoint refuses function tools together with reasoning:
             * "Function tools with reasoning_effort are not supported ... To use function tools,
             * use /v1/responses or set reasoning_effort to 'none'." We stay on /v1/chat/completions
             * (OpenRouter speaks that dialect too) and take the documented way out instead of
             * switching endpoints. OpenRouter never sees this key — its own models are not gpt-5
             * reasoning models and do not reject tool calls this way.
             */
            ...(provider === "OpenAI" ? { reasoning_effort: "none" } : {}),
          }
        : {}),
      ...(request.responseFormat
        ? { response_format: responseFormat(request.responseFormat) }
        : {}),
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
      ...(request.onText ? { stream: true } : {}),
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
          // Stop has to reach the provider, not just the promise the caller is waiting on, so
          // the caller's signal and the per-call budget both end this fetch.
          signal: request.signal
            ? AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)])
            : AbortSignal.timeout(timeoutMs),
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
    /* Only a streamed 200 leaves the whole-body path; a failure is read and mapped as ever. */
    if (request.onText && response.ok) return readStreamedAnswer(response, request.onText);
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
