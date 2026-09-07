import { isFlowDocument, type FlowDocument } from "@automator/contracts";

/**
 * A stored document that predates a node type change no longer matches the response schema.
 * Reads check it here so that one such flow answers 422 `invalid_flow` instead of the 500 the
 * response validator would raise, and the log names the flow to fix.
 */
export function isStoredDocumentValid(document: FlowDocument, log: boolean): boolean {
  const { id } = document;
  if (isFlowDocument(document)) return true;
  if (log) console.warn(`Stored flow ${id} no longer matches the document schema`);
  return false;
}
