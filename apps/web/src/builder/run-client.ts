import {
  parseAuthError,
  parseResponse,
  runFlowContract,
  runSavedFlowContract,
  type FlowRun,
  type FlowRunRecord,
  type FlowRunRequest,
  type RunSavedFlowInput,
} from "@automator/contracts";

export class RunRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "RunRequestError";
  }
}

export async function runFlowRequest(
  token: string | null,
  input: FlowRunRequest,
  signal?: AbortSignal,
): Promise<FlowRun> {
  if (!token) throw new RunRequestError("unauthorized");
  const response = await fetch(`/api${runFlowContract.path}`, {
    method: runFlowContract.method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(65_000)])
      : AbortSignal.timeout(65_000),
  });
  const data: unknown = await response.json();
  if (!response.ok) throw new RunRequestError(parseAuthError(data).error);
  const result = parseResponse(runFlowContract, response.status, data);
  if (result.status !== 200) throw new RunRequestError(result.data.error);
  return result.data;
}

export async function runSavedFlowRequest(
  token: string | null,
  flowId: string,
  input: RunSavedFlowInput,
  signal?: AbortSignal,
): Promise<FlowRunRecord> {
  if (!token) throw new RunRequestError("unauthorized");
  const response = await fetch(`/api/flows/${encodeURIComponent(flowId)}/runs`, {
    method: runSavedFlowContract.method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(65_000)])
      : AbortSignal.timeout(65_000),
  });
  const data: unknown = await response.json();
  if (!response.ok) throw new RunRequestError(parseAuthError(data).error);
  const result = parseResponse(runSavedFlowContract, response.status, data);
  if (result.status !== 201) throw new RunRequestError(result.data.error);
  return result.data;
}
