/**
 * The engine's view of a chat model: one request in, one assistant turn out. The API
 * implements it over OpenRouter; tests script it. Nothing here touches the network.
 */

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** Set on an assistant message that asked for tools. */
  toolCalls?: ToolCall[];
  /** Set on a tool message: which call it answers. */
  toolCallId?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON schema for the arguments object. */
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
}

export interface ChatResponse {
  content: string | null;
  toolCalls: ToolCall[];
}

export type LanguageModel = (request: ChatRequest) => Promise<ChatResponse>;

export type LanguageModelFailure = "unconfigured" | "timeout" | "upstream" | "invalid_response";

/** Raised by a model implementation; `kind` tells the caller whether retrying makes sense. */
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

/** Reads the model's JSON answer; fenced code blocks are tolerated. Throws on anything else. */
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

/**
 * A model for tests: answers turn by turn from a script, and records every request so a
 * test can assert what it was asked. Throws once the script runs out.
 */
export function scriptedModel(turns: readonly ChatResponse[]) {
  const requests: ChatRequest[] = [];
  let index = 0;
  const model: LanguageModel = async (request) => {
    // A snapshot, since callers keep appending to the same messages array.
    requests.push(structuredClone(request));
    const turn = turns[index++];
    if (!turn) throw new Error(`Scripted model has no answer for turn ${index}`);
    return turn;
  };
  return { model, requests };
}
