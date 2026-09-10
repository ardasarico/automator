import {
  deleteFlowContract,
  parseResponse,
  patchFlowContract,
  refusedActivationProblems,
  updateFlowContract,
  type FlowDocumentInput,
  type FlowPatch,
  type FlowProblem,
  type FlowRecord,
} from "@automator/contracts";

export class FlowRequestError extends Error {
  constructor(
    public readonly code: string,
    /** The problems a refused activation or publication named; empty for every other failure. */
    public readonly problems: readonly FlowProblem[] = [],
  ) {
    super(code);
    this.name = "FlowRequestError";
  }
}

export async function saveFlowRequest(
  id: string,
  token: string | null,
  input: FlowDocumentInput,
): Promise<FlowRecord> {
  if (!token) throw new FlowRequestError("unauthorized");
  const response = await fetch(`/api/flows/${encodeURIComponent(id)}`, {
    method: updateFlowContract.method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(20_000),
  });
  const data: unknown = await response.json();
  const result = parseResponse(updateFlowContract, response.status, data);
  if (result.status !== 200) throw new FlowRequestError(result.data.error);
  return result.data;
}

export async function deleteFlowRequest(id: string, token: string | null): Promise<void> {
  if (!token) throw new FlowRequestError("unauthorized");
  const response = await fetch(`/api/flows/${encodeURIComponent(id)}`, {
    method: deleteFlowContract.method,
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  const data: unknown = await response.json();
  const result = parseResponse(deleteFlowContract, response.status, data);
  if (result.status !== 200) throw new FlowRequestError(result.data.error);
}

async function patchFlowRequest(
  id: string,
  token: string | null,
  patch: FlowPatch,
): Promise<FlowRecord> {
  if (!token) throw new FlowRequestError("unauthorized");
  const response = await fetch(`/api/flows/${encodeURIComponent(id)}`, {
    method: patchFlowContract.method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(patch),
    signal: AbortSignal.timeout(20_000),
  });
  const data: unknown = await response.json();
  const result = parseResponse(patchFlowContract, response.status, data);
  if (result.status !== 200)
    throw new FlowRequestError(result.data.error, refusedActivationProblems(result.data));
  return result.data;
}

export async function setFlowEnabledRequest(
  id: string,
  token: string | null,
  enabled: boolean,
): Promise<FlowRecord> {
  return patchFlowRequest(id, token, { enabled });
}

export async function setFlowAppPublishedRequest(
  id: string,
  token: string | null,
  appPublished: boolean,
): Promise<FlowRecord> {
  return patchFlowRequest(id, token, { appPublished });
}
