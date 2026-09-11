import {
  aiErrorDetailMaxLength,
  aiRequestTimeoutMs,
  buildPath,
  clearAiMessagesContract,
  listAiMessagesContract,
  parseAuthError,
  parseResponse,
  sendAiMessageContract,
  setAiProposalStateContract,
  type AiMessage,
  type AiStreamEvent,
  type ContractParams,
  type EndpointContract,
  type SendAiMessageRequest,
} from "@automator/contracts";
import { parseSseFrames } from "./sse";

export class AiRequestError extends Error {
  constructor(
    public readonly code: string,
    /** The API's own account of what went wrong, already redacted and bounded. */
    public readonly detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "AiRequestError";
  }
}

const failureMessages: Record<string, string> = {
  unauthorized: "Your session expired. Reload the page and try again.",
  unavailable: "AI could not complete this request right now. Please try again shortly.",
  invalid_flow: "The model could not produce a valid flow for that. Try rephrasing.",
  invalid_request: "The request was rejected. Shorten the prompt and try again.",
  rate_limited: "Too many requests. Try again in a moment.",
  invalid_response: "The AI stream was interrupted. Try again.",
};

/**
 * The code decides the wording; the detail says what actually failed, which is the difference
 * between "try rephrasing" and knowing that one expectation named a handle the node does not have.
 */
export function describeAiFailure(error: unknown): string {
  const code = error instanceof AiRequestError ? error.code : "unavailable";
  const message = failureMessages[code] ?? "The answer could not be produced. Please try again.";
  const detail = error instanceof AiRequestError ? error.detail : undefined;
  return detail ? `${message}\n\n${detail}` : message;
}

function failureDetail(body: unknown): string | undefined {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail !== "string") return undefined;
  const text = detail.trim().slice(0, aiErrorDetailMaxLength);
  return text === "" ? undefined : text;
}

/** Reads and throws the API's own account of a failed response; a no-op on success. */
async function throwIfNotOk(response: Response): Promise<void> {
  if (response.ok) return;
  const data: unknown = await response.json().catch(() => ({}));
  throw new AiRequestError(parseAuthError(data).error, failureDetail(data));
}

/** mm:ss for a wait measured in whole seconds, so the panel never implies precision it lacks. */
export function formatElapsed(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * One request to the API: builds the path, attaches the bearer token when present, parses the
 * body. `keepalive` lets a short, fire-and-forget write survive a navigation that would otherwise
 * abort it — only worth the (browser-enforced, ~64KB) body limit for requests small enough to
 * never approach it, so callers opt in per request rather than it being the default.
 */
async function request<C extends EndpointContract>(
  contract: C,
  token: string | null,
  params?: ContractParams<C>,
  body?: unknown,
  keepalive?: boolean,
): Promise<unknown> {
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`/api${buildPath(contract, params)}`, {
    method: contract.method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
    ...(keepalive ? { keepalive: true } : {}),
  });
  await throwIfNotOk(response);
  const data: unknown = await response.json().catch(() => ({}));
  return parseResponse(contract, response.status, data).data;
}

export async function listAiMessages(token: string | null, flowId: string): Promise<AiMessage[]> {
  const data = (await request(listAiMessagesContract, token, { id: flowId })) as {
    messages: AiMessage[];
  };
  return data.messages;
}

export async function setAiProposalState(
  token: string | null,
  flowId: string,
  messageId: string,
  state: "applied" | "discarded",
): Promise<AiMessage> {
  const data = (await request(
    setAiProposalStateContract,
    token,
    { id: flowId, messageId },
    { state },
    // Applying/discarding a proposal often precedes a reload (fitView, navigation away from the
    // flow); keepalive lets this small write finish instead of being aborted with the page.
    true,
  )) as { message: AiMessage };
  return data.message;
}

export async function clearAiMessages(token: string | null, flowId: string): Promise<void> {
  await request(clearAiMessagesContract, token, { id: flowId });
}

export async function sendAiMessage(
  token: string | null,
  flowId: string,
  body: SendAiMessageRequest,
  onEvent: (event: AiStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const timeout = AbortSignal.timeout(aiRequestTimeoutMs + 5_000);
  const response = await fetch(`/api${buildPath(sendAiMessageContract, { id: flowId })}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  await throwIfNotOk(response);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseSseFrames(buffer);
      buffer = rest;
      for (const event of events) onEvent(event);
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
