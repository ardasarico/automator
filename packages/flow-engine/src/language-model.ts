export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type ResponseFormat =
  | { type: "json_object" }
  | { type: "json_schema"; name: string; schema: Record<string, unknown> };

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  responseFormat?: ResponseFormat;
  temperature?: number;
  /** Called with each content delta when the provider streams; absent, the answer arrives whole. */
  onText?: (delta: string) => void;
  /** Aborts the call at the provider, so Stop reaches further than the caller's own promise. */
  signal?: AbortSignal;
}

export interface ChatResponse {
  content: string | null;
  toolCalls: ToolCall[];
}

export type LanguageModel = (request: ChatRequest) => Promise<ChatResponse>;

export type LanguageModelFailure = "unconfigured" | "timeout" | "upstream" | "invalid_response";

export class LanguageModelError extends Error {
  constructor(
    readonly kind: LanguageModelFailure,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LanguageModelError";
  }
}

export function parseJsonAnswer(content: string | null): unknown {
  if (content === null)
    throw new LanguageModelError("invalid_response", "The model answered nothing");
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  try {
    return JSON.parse(fenced ? fenced[1]! : trimmed);
  } catch {
    throw new LanguageModelError("invalid_response", "The model did not answer with JSON");
  }
}

export function scriptedModel(turns: readonly ChatResponse[]) {
  const requests: ChatRequest[] = [];
  let index = 0;
  const model: LanguageModel = async (request) => {
    // A snapshot, since callers keep appending to the same messages array. `onText` and
    // `signal` are dropped: a scripted answer never streams, and `structuredClone` copies
    // neither a function nor an AbortSignal.
    const { onText: _onText, signal: _signal, ...rest } = request;
    requests.push(structuredClone(rest));
    const turn = turns[index++];
    if (!turn) throw new Error(`Scripted model has no answer for turn ${index}`);
    return turn;
  };
  return { model, requests };
}
