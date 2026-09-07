import type { Metadata } from "next";
import { FlowBuilder } from "../../../../builder/flow-builder";
import { resolveFlowDocument } from "../../../../builder/resolve-document";

export const metadata: Metadata = { title: "Flow · Automator" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ example?: string | string[] }>;
};

/** The canonical flow URL. The document is client state until the flows API lands. */
export default async function FlowPage({ params, searchParams }: Props) {
  const [{ id }, { example }] = await Promise.all([params, searchParams]);
  const slug = Array.isArray(example) ? example[0] : example;
  return (
    // A new id or example seed remounts the builder and its store: no effect-based hydration.
    <FlowBuilder key={`${id}:${slug ?? ""}`} document={resolveFlowDocument(id, example)} />
  );
}
