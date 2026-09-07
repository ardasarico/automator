import type { Metadata } from "next";
import { listFlows, listRuns } from "../../../flows/server";
import { WorkspaceBreadcrumbs } from "../../../components/workspace-breadcrumbs";
import { WorkspacePage } from "../../../components/workspace-page";
import { RunFilter } from "./run-filter";
import { RunHistory } from "./run-history";

export const metadata: Metadata = { title: "Runs · Automator" };

/** Recent runs across the user's flows; `?flow=<id>` narrows the list to one flow. */
export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<{ flow?: string | string[] }>;
}) {
  const requested = (await searchParams).flow;
  const flowId = Array.isArray(requested) ? requested[0] : requested;
  const [flows, runs] = await Promise.all([listFlows(), listRuns(flowId || undefined)]);
  return (
    <WorkspacePage>
      <WorkspaceBreadcrumbs current="Runs" />
      <RunFilter flows={flows} selected={flowId ?? ""} />
      <RunHistory runs={runs} filtered={Boolean(flowId)} />
    </WorkspacePage>
  );
}
