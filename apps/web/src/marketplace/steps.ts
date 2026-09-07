import type { FlowDocument } from "@automator/contracts";
import { getCatalogEntry } from "../builder/catalog";
import type { ListingStep } from "./listing";

/**
 * The "How it works" overview for a published flow: one step per non-trigger node in
 * document order, named by the node's label and described by its catalog entry.
 */
export function stepsFromDocument(document: Pick<FlowDocument, "nodes">): ListingStep[] {
  return document.nodes
    .filter((node) => !node.type.startsWith("trigger."))
    .map((node) => ({ name: node.label, description: getCatalogEntry(node.type).description }));
}
