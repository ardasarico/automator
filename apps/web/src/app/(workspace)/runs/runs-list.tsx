import { redirect } from "next/navigation";
import { PageFrame } from "../../../components/page-frame";
import { FlowApiError, listFlows, listRuns } from "../../../flows/server";
import { firstParam, readRunListState, runsHref, type RunsSearchParams } from "./run-links";
import { RunHistory } from "./run-history";
import { RunStats } from "./run-stats";

const pageSize = 25;

/**
 * The run list. Both `/runs` and `/runs/<id>` render it — the second only adds the open run
 * beside it — so the list is written once and the URL says which row is selected.
 */
export async function RunsList({
  searchParams,
  selectedId,
}: {
  searchParams: Promise<RunsSearchParams>;
  selectedId?: string;
}) {
  const params = await searchParams;
  const state = readRunListState(params);
  const cursor = firstParam(params.cursor);
  const [flows, page] = await Promise.all([
    listFlows(),
    listRuns({ ...state, cursor, limit: pageSize }).catch((error: unknown) => {
      if (cursor && error instanceof FlowApiError && error.status === 400) {
        redirect(runsHref(state));
      }
      throw error;
    }),
  ]);
  return (
    <PageFrame
      title="Runs"
      /* Counted over its own window, so paging the list below does not move the numbers. */
      banner={<RunStats flowId={state.flowId} />}
    >
      <RunHistory
        runs={page.runs}
        flows={flows}
        state={state}
        cursor={cursor}
        nextCursor={page.nextCursor}
        selectedId={selectedId}
      />
    </PageFrame>
  );
}
