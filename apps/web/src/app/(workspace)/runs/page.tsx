import type { Metadata } from "next";
import { listFlows, listRuns } from "../../../flows/server";
import { WorkspaceBreadcrumbs } from "../../../components/workspace-breadcrumbs";
import { WorkspacePage } from "../../../components/workspace-page";
import { RunFilter } from "./run-filter";
import { RunHistory } from "./run-history";

export const metadata: Metadata = { title: "Runs · Automator" };

const pageSize = 25;

type SearchParams = { flow?: string | string[]; cursor?: string | string[] };

function first(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single || undefined;
}

/** The runs URL for one page: `?flow=<id>` narrows to a flow, `?cursor=` continues a list. */
function runsHref(flowId: string | undefined, cursor: string | undefined): string {
  const params = new URLSearchParams();
  if (flowId) params.set("flow", flowId);
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return query ? `/runs?${query}` : "/runs";
}

/**
 * Recent runs across the user's flows, a page at a time; `?flow=<id>` narrows the list to
 * one flow and `?cursor=` shows the page after the one that minted it.
 */
export default async function RunsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const flowId = first(params.flow);
  const cursor = first(params.cursor);
  const [flows, page] = await Promise.all([
    listFlows(),
    listRuns({ flowId, cursor, limit: pageSize }),
  ]);
  return (
    <WorkspacePage>
      <WorkspaceBreadcrumbs current="Runs" />
      <RunFilter flows={flows} selected={flowId ?? ""} />
      <RunHistory
        runs={page.runs}
        filtered={Boolean(flowId)}
        nextHref={page.nextCursor ? runsHref(flowId, page.nextCursor) : undefined}
      />
    </WorkspacePage>
  );
}
