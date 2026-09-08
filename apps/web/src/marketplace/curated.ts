import { flowExamples } from "../app/(workspace)/marketplace/examples";
import { exampleToFlowDocument } from "../builder/examples";
import type { MarketplaceItem } from "./listing";

export const curatedListings: readonly MarketplaceItem[] = flowExamples.map((example) => ({
  slug: example.id,
  name: example.name,
  description: example.description,
  author: { kind: "automator" },
  nodeTypes: example.nodeTypes,
  steps: example.steps,
  forkCount: 0,
  document: exampleToFlowDocument(example, `example-${example.id}`),
}));
