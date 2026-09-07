import type { FlowDocument, FlowNode, FlowNodeType } from "@automator/contracts";
import { flowExamples } from "../app/(workspace)/marketplace/examples";
import { getCatalogEntry } from "./catalog";

export type FlowExample = (typeof flowExamples)[number];

const columnGap = 300;
const rowY = 120;
const startX = 80;

/** Keyword to node type, checked against the step name and description in order. */
const keywordTypes: readonly [RegExp, FlowNodeType][] = [
  [/world/i, "integration.world-selfie-check"],
  [/privy/i, "integration.privy-wallet"],
  [/usdc/i, "integration.usdc-payment"],
];

function stepType(step: FlowExample["steps"][number]): FlowNodeType {
  const text = `${step.name} ${step.description}`;
  return keywordTypes.find(([pattern]) => pattern.test(text))?.[1] ?? "screen.page";
}

export function findFlowExample(slug: string | undefined): FlowExample | undefined {
  return slug ? flowExamples.find((example) => example.id === slug) : undefined;
}

/**
 * Seeds a canvas from a curated example: a mini-app trigger followed by one node per step,
 * chained left to right. Steps name integrations in their copy, which is enough for dummy
 * nodes; anything else becomes a screen.
 */
export function exampleToFlowDocument(example: FlowExample, id: string): FlowDocument {
  const trigger: FlowNode = {
    id: crypto.randomUUID(),
    type: "trigger.miniapp-open",
    position: { x: startX, y: rowY },
    label: getCatalogEntry("trigger.miniapp-open").label,
    config: {},
  };
  const steps: FlowNode[] = example.steps.map((step, index) => ({
    id: crypto.randomUUID(),
    type: stepType(step),
    position: { x: startX + (index + 1) * columnGap, y: rowY },
    label: step.name,
    config: {},
  }));
  const nodes = [trigger, ...steps];
  // Seeded chains use the first port on each side, so every edge names its handles.
  const edges = nodes.slice(1).map((node, index) => {
    const source = nodes[index]!;
    return {
      id: crypto.randomUUID(),
      source: source.id,
      sourceHandle: getCatalogEntry(source.type).outputs[0]!.id,
      target: node.id,
      targetHandle: getCatalogEntry(node.type).inputs[0]!.id,
    };
  });

  return {
    version: 1,
    id,
    name: example.name,
    description: example.description,
    nodes,
    edges,
  };
}
