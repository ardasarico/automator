import {
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
  unavailable: "AI is not available right now. Check that the API has an OpenRouter key.",
  invalid_flow: "The model could not produce a valid flow for that. Try rephrasing.",
  invalid_request: "The request was rejected. Shorten the prompt and try again.",
  rate_limited: "Too many requests. Try again in a moment.",
};

/** What the panel tells the user when a request fails. */
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
  // Two model turns at most, so the budget covers a slow model and one retry.
  const timeout = AbortSignal.timeout(125_000);
  const response = await fetch(`/api${contract.path}`, {
    method: contract.method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  const data: unknown = await response.json();
  if (!response.ok) throw new AiRequestError(parseAuthError(data).error);
  // The proxy answers every failure with a non-2xx status, so what is left is the 200 body.
  return parseResponse(contract, response.status, data).data;
}

/** Asks the API for a flow or a message through the same-origin proxy, which forwards the bearer token. */
export async function generateFlowRequest(
  token: string | null,
  input: GenerateFlowRequest,
  signal?: AbortSignal,
): Promise<GenerateFlowResponse> {
  return (await post(generateFlowContract, token, input, signal)) as GenerateFlowResponse;
}

/** Asks the API why a run failed; the caller redacts the document and outputs first. */
export async function explainRunRequest(
  token: string | null,
  input: ExplainRunRequest,
  signal?: AbortSignal,
): Promise<ExplainRunResponse> {
  return (await post(explainRunContract, token, input, signal)) as ExplainRunResponse;
}
