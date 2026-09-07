import type { FlowDocument } from "@automator/contracts";
import { createEmptyFlow } from "./document";
import { exampleToFlowDocument, findFlowExample } from "./examples";

/** Picks the document a `/flows/[id]` visit starts from. Persistence will replace this. */
export function resolveFlowDocument(
  id: string,
  exampleParam: string | string[] | undefined,
): FlowDocument {
  const slug = Array.isArray(exampleParam) ? exampleParam[0] : exampleParam;
  const example = findFlowExample(slug);
  return example ? exampleToFlowDocument(example, id) : createEmptyFlow(id);
}
