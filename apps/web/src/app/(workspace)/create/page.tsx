import { redirect } from "next/navigation";
import { createEmptyFlow } from "../../../builder/document";
import { exampleToFlowDocument, findFlowExample } from "../../../builder/examples";
import { createFlow } from "../../../flows/server";

/**
 * Creates a flow through the API and opens it. "New flow" lands on a blank document, and
 * "Fork flow" on a copy of the curated example named by `?example=`; the API mints the id.
 * `?ai=1` opens the new flow with the cursor in the AI prompt.
 */
export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ example?: string | string[]; ai?: string | string[] }>;
}) {
  const { example: requested, ai } = await searchParams;
  const slug = Array.isArray(requested) ? requested[0] : requested;
  const example = findFlowExample(slug);
  // The id is discarded: the API assigns the stored one.
  const { id: _draft, ...input } = example
    ? exampleToFlowDocument(example, "draft")
    : createEmptyFlow("draft");
  const { flow } = await createFlow(input);
  redirect(ai === undefined ? `/flows/${flow.id}` : `/flows/${flow.id}?ai=1`);
}
