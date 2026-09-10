import {
  aiErrorDetailMaxLength,
  aiRequestTimeoutMs,
  explainRunContract,
  generateFlowContract,
  generateFlowResponseSchema,
  parseAuthError,
  parseResponse,
  Value,
  type EndpointContract,
  type ExplainRunRequest,
  type ExplainRunResponse,
  type GenerateFlowRequest,
  type GenerateFlowResponse,
} from "@automator/contracts";

class AiRequestError extends Error {
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

async function post<C extends EndpointContract & { readonly method: "POST" }>(
  contract: C,
  token: string | null,
  input: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  if (!token) throw new AiRequestError("unauthorized");
  // Include provider fallback, one repair attempt and bounded local checks.
  const timeout = AbortSignal.timeout(aiRequestTimeoutMs + 5000);
  const response = await fetch(`/api${contract.path}`, {
    method: contract.method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  const data: unknown = await response.json();
  if (!response.ok) throw new AiRequestError(parseAuthError(data).error, failureDetail(data));
  return parseResponse(contract, response.status, data).data;
}

export async function generateFlowRequest(
  token: string | null,
  input: GenerateFlowRequest,
  signal?: AbortSignal,
): Promise<GenerateFlowResponse> {
  return (await post(generateFlowContract, token, input, signal)) as GenerateFlowResponse;
}

export async function explainRunRequest(
  token: string | null,
  input: ExplainRunRequest,
  signal?: AbortSignal,
): Promise<ExplainRunResponse> {
  return (await post(explainRunContract, token, input, signal)) as ExplainRunResponse;
}

/**
 * Home asks the model before any flow exists, so a draft that fails leaves nothing behind. The
 * prompt travels in `pending-prompt`; the answer is too large for the URL and rides here beside
 * it. Both are read once, so reloading the canvas neither replays nor re-asks.
 */
const answerKey = "automator.ai-draft-answer";

export function storeAiAnswer(answer: GenerateFlowResponse): void {
  try {
    sessionStorage.setItem(answerKey, JSON.stringify(answer));
  } catch {
    /* Private windows and blocked site data leave the canvas asking the question again. */
  }
}

export function takeAiAnswer(): GenerateFlowResponse | null {
  try {
    const stored = sessionStorage.getItem(answerKey);
    if (stored === null) return null;
    sessionStorage.removeItem(answerKey);
    const answer: unknown = JSON.parse(stored);
    return Value.Check(generateFlowResponseSchema, answer) ? answer : null;
  } catch {
    return null;
  }
}

/** mm:ss for a wait measured in whole seconds, so the panel never implies precision it lacks. */
export function formatElapsed(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
