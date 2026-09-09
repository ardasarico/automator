import type { Metadata } from "next";
import { loadRun } from "../load-run";
import { RunsList } from "../runs-list";
import type { RunsSearchParams } from "../run-links";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<RunsSearchParams>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const record = await loadRun((await params).id);
  return { title: record ? `${record.flowName} run · Automator` : "Run · Automator" };
}

/** The same list, with the open run marked. The run itself is the `panel` slot beside it. */
export default async function RunsPageWithRun({ params, searchParams }: Props) {
  return <RunsList searchParams={searchParams} selectedId={(await params).id} />;
}
