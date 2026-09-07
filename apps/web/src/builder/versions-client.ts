import {
  getFlowVersionContract,
  listFlowVersionsContract,
  parseAuthError,
  parseResponse,
  type FlowVersionRecord,
  type FlowVersionSummary,
} from "@automator/contracts";

export class VersionRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "VersionRequestError";
  }
}

/** The flow's saved versions, newest first, through the same-origin proxy. */
export async function listFlowVersionsRequest(
  token: string | null,
  flowId: string,
  signal?: AbortSignal,
): Promise<FlowVersionSummary[]> {
  if (!token) throw new VersionRequestError("unauthorized");
  const response = await fetch(`/api/flows/${encodeURIComponent(flowId)}/versions`, {
    method: listFlowVersionsContract.method,
    headers: { Authorization: `Bearer ${token}` },
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20_000)])
      : AbortSignal.timeout(20_000),
  });
  const data: unknown = await response.json();
  if (!response.ok) throw new VersionRequestError(parseAuthError(data).error);
  const result = parseResponse(listFlowVersionsContract, response.status, data);
  if (result.status !== 200) throw new VersionRequestError(result.data.error);
  return result.data.versions;
}

/** One saved version with its document, for a restore. */
export async function getFlowVersionRequest(
  token: string | null,
  flowId: string,
  number: number,
): Promise<FlowVersionRecord> {
  if (!token) throw new VersionRequestError("unauthorized");
  const response = await fetch(
    `/api/flows/${encodeURIComponent(flowId)}/versions/${encodeURIComponent(String(number))}`,
    {
      method: getFlowVersionContract.method,
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    },
  );
  const data: unknown = await response.json();
  if (!response.ok) throw new VersionRequestError(parseAuthError(data).error);
  const result = parseResponse(getFlowVersionContract, response.status, data);
  if (result.status !== 200) throw new VersionRequestError(result.data.error);
  return result.data;
}

const messages: Record<string, string> = {
  unauthorized: "Your session expired. Reload the page and try again.",
  not_found: "This version is no longer available.",
  invalid_flow: "This version uses a node type the builder no longer knows.",
  rate_limited: "Too many requests. Try again in a moment.",
};

/** What the user reads when a history request fails. */
export function describeVersionError(error: unknown): string {
  const code = error instanceof VersionRequestError ? error.code : "unavailable";
  return messages[code] ?? "The history could not be loaded. Please try again.";
}
