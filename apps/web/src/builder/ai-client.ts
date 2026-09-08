import {
  aiRequestTimeoutMs,
  explainRunContract,
  generateFlowContract,
  parseAuthError,
  parseResponse,
  type EndpointContract,
  type ExplainRunRequest,
  type ExplainRunResponse,
  type GenerateFlowRequest,
  type GenerateFlowResponse,
} from "@automator/contracts";

export class AiRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
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

export function describeAiFailure(error: unknown): string {
  const code = error instanceof AiRequestError ? error.code : "unavailable";
  return failureMessages[code] ?? "The answer could not be produced. Please try again.";
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
  if (!response.ok) throw new AiRequestError(parseAuthError(data).error);
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
