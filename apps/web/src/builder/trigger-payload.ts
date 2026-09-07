import {
  flowNodeConfigSchemas,
  parseNodeConfig,
  parseSamplePayload,
  type FlowEdge,
  type FlowNode,
} from "@automator/contracts";
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
 * A trigger's sample payload as a value, read through its config schema so a trigger whose
 * sample was never edited simulates with the default the settings panel shows (a webhook's
 * `{ method, headers, query, body }`); `{}` without a schema or when the text is not JSON.
 */
export function triggerSamplePayload(node: Pick<FlowNode, "type" | "config">): unknown {
  const schema = flowNodeConfigSchemas[node.type];
  if (!schema) return parseSamplePayload(node.config);
  try {
    return parseSamplePayload(parseNodeConfig(schema, node.config));
  } catch {
    return parseSamplePayload(node.config);
  }
}

/**
 * The payload Simulate hands to the run: the starting trigger's sample (see
 * `triggerSamplePayload`), or `{}` when there is no trigger.
 */
export function simulationTriggerPayload(
  nodes: readonly NodeLike[],
  edges: readonly EdgeLike[],
): unknown {
  const trigger = findSimulationTrigger(nodes, edges);
  return trigger ? triggerSamplePayload(trigger) : {};
}
