"use server";

import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { requireUser } from "../auth/server";
import { createEmptyFlow } from "../builder/document";
import { exampleToFlowDocument, findFlowExample } from "../builder/examples";
import { forkListing } from "../marketplace/server";
import { actionUnavailable, type FlowActionState } from "./action-state";
import { createFlow } from "./server";

/*
 * Both actions answer with a failure rather than letting one out, so the button that submitted
 * them can say what happened. `unstable_rethrow` puts back what the framework throws to steer
 * the request — the redirect that is the success path here, and notFound — since catching those
 * would turn a working create into a silent one.
 */
async function attempt(work: () => Promise<never>): Promise<FlowActionState> {
  try {
    return await work();
  } catch (error) {
    unstable_rethrow(error);
    return { error: actionUnavailable };
  }
}

export async function createFlowAction(
  options: { example?: string; ai?: boolean } = {},
): Promise<FlowActionState> {
  return attempt(async () => {
    await requireUser();
    const example = findFlowExample(
      typeof options.example === "string" ? options.example : undefined,
    );
    const { id: _draft, ...input } = example
      ? exampleToFlowDocument(example, "draft")
      : createEmptyFlow("draft");
    const { flow } = await createFlow(input);
    redirect(options.ai === true ? `/flows/${flow.id}?ai=1` : `/flows/${flow.id}`);
  });
}

export async function forkFlowAction(slug: string): Promise<FlowActionState> {
  return attempt(async () => {
    await requireUser();
    if (typeof slug !== "string") notFound();
    const record = await forkListing(slug);
    if (!record) notFound();
    redirect(`/flows/${record.flow.id}`);
  });
}
