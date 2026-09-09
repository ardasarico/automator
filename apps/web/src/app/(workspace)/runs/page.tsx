import { isFlowRunStatus, type FlowRunStatus } from "@automator/contracts";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FlowApiError, listFlows, listRuns } from "../../../flows/server";
import { WorkspaceBreadcrumbs } from "../../../components/workspace-breadcrumbs";
import { WorkspacePage } from "../../../components/workspace-page";
import { RunFilter } from "./run-filter";
import { RunHistory } from "./run-history";

export const metadata: Metadata = { title: "Runs · Automator" };

const pageSize = 25;

type SearchParams = {
  flow?: string | string[];
  status?: string | string[];
  cursor?: string | string[];
};

function first(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single || undefined;
}

export function runsHref(
  flowId: string | undefined,
  status: FlowRunStatus | undefined,
  cursor?: string,
): string {
  const params = new URLSearchParams();
  if (flowId) params.set("flow", flowId);
  if (status) params.set("status", status);
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return query ? `/runs?${query}` : "/runs";
}

export default async function RunsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const flowId = first(params.flow);
  const cursor = first(params.cursor);
  const requested = first(params.status);
  /* An unreadable status would silently filter everything out, so it is dropped instead. */
  const status = requested !== undefined && isFlowRunStatus(requested) ? requested : undefined;
  const [flows, page] = await Promise.all([
    listFlows(),
    listRuns({ flowId, status, cursor, limit: pageSize }).catch((error: unknown) => {
      if (cursor && error instanceof FlowApiError && error.status === 400) {
        redirect(runsHref(flowId, status));
      }
      throw error;
    }),
  ]);
  return (
    <WorkspacePage>
      <WorkspaceBreadcrumbs current="Runs" />
      <RunFilter flows={flows} selected={flowId ?? ""} status={status} />
      <RunHistory
        runs={page.runs}
        filtered={Boolean(flowId) || Boolean(status)}
        status={status}
        nextHref={page.nextCursor ? runsHref(flowId, status, page.nextCursor) : undefined}
        latestHref={cursor ? runsHref(flowId, status) : undefined}
      />
    </WorkspacePage>
  );
}
