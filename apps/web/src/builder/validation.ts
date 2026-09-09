import {
  findFlowProblems as findProblems,
  type FlowConfigTable,
  type FlowDocument,
} from "@automator/contracts";
import { getCatalogEntry } from "./catalog";

export { countErrors, type FlowProblem } from "@automator/contracts";

/**
 * The builder's view of `findFlowProblems`: the same checks the API runs before it lets a flow
 * go live, named with the labels the canvas shows. Both read one rule set in `@automator/contracts`
 * so the canvas and the server never disagree about what "broken" means.
 */
export function findFlowProblems(
  document: Pick<FlowDocument, "nodes" | "edges">,
  tables?: readonly FlowConfigTable[],
) {
  return findProblems(document, {
    ...(tables ? { tables } : {}),
    fallbackLabel: (type) => getCatalogEntry(type).label,
  });
}
