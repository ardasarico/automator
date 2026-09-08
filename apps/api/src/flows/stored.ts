import { isFlowDocument, type FlowDocument } from "@automator/contracts";

/* Reject obsolete stored schemas with 422 before response validation turns them into 500s. */
export function isStoredDocumentValid(document: FlowDocument, log: boolean): boolean {
  const { id } = document;
  if (isFlowDocument(document)) return true;
  if (log) console.warn(`Stored flow ${id} no longer matches the document schema`);
  return false;
}
