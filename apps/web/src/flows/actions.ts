"use server";

import { notFound, redirect } from "next/navigation";
import { requireUser } from "../auth/server";
import { createEmptyFlow } from "../builder/document";
import { exampleToFlowDocument, findFlowExample } from "../builder/examples";
import { forkListing } from "../marketplace/server";
import { createFlow } from "./server";

/** Creating and forking are POST actions; page rendering and prefetching never write flows. */
export async function createFlowAction(options: { example?: string; ai?: boolean } = {}) {
  await requireUser();
  const example = findFlowExample(
    typeof options.example === "string" ? options.example : undefined,
  );
  const { id: _draft, ...input } = example
    ? exampleToFlowDocument(example, "draft")
    : createEmptyFlow("draft");
  const { flow } = await createFlow(input);
  redirect(options.ai === true ? `/flows/${flow.id}?ai=1` : `/flows/${flow.id}`);
}

export async function forkFlowAction(slug: string) {
  await requireUser();
  if (typeof slug !== "string") notFound();
  const record = await forkListing(slug);
  if (!record) notFound();
  redirect(`/flows/${record.flow.id}`);
}
