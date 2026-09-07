import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FlowBuilder } from "../../../../builder/flow-builder";
import { getFlow, getRun } from "../../../../flows/server";

export const metadata: Metadata = { title: "Flow · Automator" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ run?: string | string[] }>;
};

/**
 * The canonical flow URL: the builder opens on the stored document. `?run=<id>` shows one of
 * the flow's stored runs on the canvas; a run that is not the caller's is ignored.
 */
export default async function FlowPage({ params, searchParams }: Props) {
  const [{ id }, { run: requestedRun }] = await Promise.all([params, searchParams]);
  const runId = Array.isArray(requestedRun) ? requestedRun[0] : requestedRun;
  const [record, run] = await Promise.all([getFlow(id), runId ? getRun(runId) : null]);
  if (!record) notFound();
  const initialRun = run && run.run.flowId === id ? run.run : null;
  // A different id or run remounts the builder and its stores: no effect-based hydration.
  return (
    <FlowBuilder
      key={`${id}:${initialRun?.id ?? ""}`}
      document={record.flow}
      enabled={record.enabled ?? false}
      webhookToken={record.webhookToken ?? null}
      initialRun={initialRun}
    />
  );
}
