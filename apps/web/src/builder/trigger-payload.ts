import { parseSamplePayload, type FlowEdge, type FlowNode } from "@automator/contracts";
import { getCatalogEntry } from "./catalog";

type NodeLike = Pick<FlowNode, "id" | "type" | "config">;
type EdgeLike = Pick<FlowEdge, "target">;

/**
 * The trigger Simulate starts from: the first trigger in document order with no incoming
 * edge, which is the same rule the engine uses to pick where a run begins.
 */
export function findSimulationTrigger<T extends NodeLike>(
  nodes: readonly T[],
  edges: readonly EdgeLike[],
): T | undefined {
  const targets = new Set(edges.map((edge) => edge.target));
  return nodes.find(
    (node) => getCatalogEntry(node.type).category === "trigger" && !targets.has(node.id),
  );
}

/**
 * The payload Simulate hands to the run: the starting trigger's `samplePayload`, parsed, or
 * `{}` when there is no trigger, no sample, or the sample is not valid JSON.
 */
export function simulationTriggerPayload(
  nodes: readonly NodeLike[],
  edges: readonly EdgeLike[],
): unknown {
  return parseSamplePayload(findSimulationTrigger(nodes, edges)?.config);
}
