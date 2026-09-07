import { flowExamples } from "../app/(workspace)/marketplace/examples";
import { exampleToFlowDocument } from "../builder/examples";
import type { MarketplaceItem } from "./listing";

/**
 * The curated examples as marketplace listings. They are published by Automator, carry no
 * publish date, and their fork counts are not tracked, so they read as zero.
 */
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
