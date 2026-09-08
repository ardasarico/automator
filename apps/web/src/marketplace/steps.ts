import type { FlowDocument } from "@automator/contracts";
import { getCatalogEntry } from "../builder/catalog";
import type { ListingStep } from "./listing";

export function stepsFromDocument(document: Pick<FlowDocument, "nodes">): ListingStep[] {
  return document.nodes
    .filter((node) => !node.type.startsWith("trigger."))
    .map((node) => ({ name: node.label, description: getCatalogEntry(node.type).description }));
}
