import { listTriggerIssuesContract, parseResponse } from "@automator/contracts";
import { FlowRequestError } from "../flows/client";

export async function fetchTriggerIssues(id: string, token: string | null, signal: AbortSignal) {
  if (!token) throw new FlowRequestError("unauthorized");
  const response = await fetch(`/api/flows/${encodeURIComponent(id)}/trigger-issues`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
  });
  const result = parseResponse(listTriggerIssuesContract, response.status, await response.json());
  if (result.status !== 200) throw new FlowRequestError(result.data.error);
  return result.data.issues;
}
