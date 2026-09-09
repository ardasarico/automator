import { notFound } from "next/navigation";
import { SidePanel } from "../../../../../components/side-panel";
import { loadRun } from "../../load-run";
import { RunDetail } from "../../run-detail";
import { firstParam, readRunListState, runsHref, type RunsSearchParams } from "../../run-links";

export default async function RunPanel({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RunsSearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const record = await loadRun(id);
  if (!record) notFound();
  return (
    <SidePanel
      label="Run details"
      title={record.flowName}
      /* Closing returns to the list as it was filtered, ordered and paged. */
      closeHref={runsHref(readRunListState(query), firstParam(query.cursor))}
    >
      <RunDetail record={record} />
    </SidePanel>
  );
}
