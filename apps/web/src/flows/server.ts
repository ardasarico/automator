import "server-only";
import { ApiRequestError, request } from "@automator/api-client/server";
import {
  createFlowContract,
  getFlowContract,
  getRunContract,
  listAllRunsContract,
  listFlowsContract,
  type FlowDocumentInput,
  type FlowRecord,
  type FlowRunRecord,
  type FlowSummary,
  type RunList,
} from "@automator/contracts";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "../auth/server";

/** Raised for any API answer other than the one a page can render. */
export class FlowApiError extends Error {
  constructor(public readonly status: number) {
    super(`Flow request failed with ${status}`);
    this.name = "FlowApiError";
  }
}

/**
 * The mirrored session cookie carries the Privy token, so server pages call the API as the
 * signed-in user. A missing or rejected token sends the visitor to sign in again rather
 * than rendering a half-empty page.
 */
async function sessionToken() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");
  return token;
}

function unavailable(error: unknown): never {
  throw error instanceof ApiRequestError ? new FlowApiError(503) : error;
}

export async function listFlows(): Promise<readonly FlowSummary[]> {
  const token = await sessionToken();
  const result = await request(process.env.API_URL, listFlowsContract, { token }).catch(
    unavailable,
  );
  if (result.status === 401) redirect("/login");
  if (result.status !== 200) throw new FlowApiError(result.status);
  return result.data.flows;
}

/** `null` when the caller has no flow with this id. */
export async function getFlow(id: string): Promise<FlowRecord | null> {
  const token = await sessionToken();
  const result = await request(process.env.API_URL, getFlowContract, {
    token,
    params: { id },
  }).catch(unavailable);
  if (result.status === 401) redirect("/login");
  if (result.status === 404) return null;
  if (result.status !== 200) throw new FlowApiError(result.status);
  return result.data;
}

export async function createFlow(input: FlowDocumentInput): Promise<FlowRecord> {
  const token = await sessionToken();
  const result = await request(process.env.API_URL, createFlowContract, {
    token,
    body: input,
    timeoutMs: 15_000,
  }).catch(unavailable);
  if (result.status === 401) redirect("/login");
  if (result.status !== 201) throw new FlowApiError(result.status);
  return result.data;
}

/**
 * One page of the caller's runs across every flow, newest first. `cursor` is the previous
 * page's `nextCursor`; `limit` falls back to the API default when absent.
 */
export async function listRuns(
  options: { flowId?: string; cursor?: string; limit?: number } = {},
): Promise<RunList> {
  const token = await sessionToken();
  const result = await request(process.env.API_URL, listAllRunsContract, {
    token,
    query: {
      flowId: options.flowId,
      cursor: options.cursor,
      limit: options.limit === undefined ? undefined : String(options.limit),
    },
  }).catch(unavailable);
  if (result.status === 401) redirect("/login");
  if (result.status !== 200) throw new FlowApiError(result.status);
  return result.data;
}

/** `null` when the caller has no run with this id. */
export async function getRun(id: string): Promise<FlowRunRecord | null> {
  const token = await sessionToken();
  const result = await request(process.env.API_URL, getRunContract, {
    token,
    params: { id },
  }).catch(unavailable);
  if (result.status === 401) redirect("/login");
  if (result.status === 404) return null;
  if (result.status !== 200) throw new FlowApiError(result.status);
  return result.data;
}
