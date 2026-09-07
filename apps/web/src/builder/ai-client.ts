import {
  generateFlowContract,
  parseAuthError,
  parseResponse,
  type GenerateFlowRequest,
  type GenerateFlowResponse,
} from "@automator/contracts";

export class AiRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "AiRequestError";
  }
}

/** Asks the API for a flow through the same-origin proxy, which forwards the bearer token. */
export async function generateFlowRequest(
  token: string | null,
  input: GenerateFlowRequest,
  signal?: AbortSignal,
): Promise<GenerateFlowResponse> {
  if (!token) throw new AiRequestError("unauthorized");
  const timeout = AbortSignal.timeout(125_000);
  const response = await fetch(`/api${generateFlowContract.path}`, {
    method: generateFlowContract.method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  const data: unknown = await response.json();
  if (!response.ok) throw new AiRequestError(parseAuthError(data).error);
  const result = parseResponse(generateFlowContract, response.status, data);
  if (result.status !== 200) throw new AiRequestError(result.data.error);
  return result.data;
}
