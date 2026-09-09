import { documentOutline } from "@automator/contracts";
import { flowExamples } from "../app/(workspace)/marketplace/examples";
import { exampleToFlowDocument } from "../builder/examples";
import type { MarketplaceItem } from "./listing";

export const curatedListings: readonly MarketplaceItem[] = flowExamples.map((example) => {
  const document = exampleToFlowDocument(example, `example-${example.id}`);
  return {
    slug: example.id,
    name: example.name,
    description: example.description,
    author: { kind: "automator" },
    nodeTypes: example.nodeTypes,
    outline: documentOutline(document),
    steps: example.steps,
    forkCount: 0,
    document,
  };
});

/**
 * The editorial pick, in order of preference. Ours to choose — no invented "trending" metric
 * decides it. A community slug may lead the list; `featuredListing` falls back when it is gone.
 */
export const featuredSlugs: readonly string[] = [
  "proof-of-human-airdrop",
  "invoice-to-payout",
  "usdc-payout",
];
