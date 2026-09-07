import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { WorkspacePage } from "../../../../components/workspace-page";
import { getRun } from "../../../../flows/server";
import { RunDetail } from "./run-detail";

// Metadata and the page read the same run; `cache` makes that one API call per request.
const loadRun = cache((id: string) => getRun(id));

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const record = await loadRun((await params).id);
  return { title: record ? `${record.flowName} run · Automator` : "Run · Automator" };
}

/** One stored run: what started it, what every node did, and where the variables ended. */
export default async function RunPage({ params }: Props) {
  const record = await loadRun((await params).id);
  if (!record) notFound();
  return (
    <WorkspacePage>
      <RunDetail record={record} />
    </WorkspacePage>
  );
}
