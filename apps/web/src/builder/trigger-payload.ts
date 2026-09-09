import {
  flowNodeConfigSchemas,
  parseNodeConfig,
  parseSamplePayload,
  type FlowEdge,
  type FlowNode,
  type TObject,
} from "@automator/contracts";
import { getCatalogEntry } from "./catalog";

const configSchemas: Partial<Record<FlowNode["type"], TObject>> = flowNodeConfigSchemas;

type TriggerLike = Pick<FlowNode, "id" | "type">;
type NodeLike = Pick<FlowNode, "id" | "type" | "config">;
type EdgeLike = Pick<FlowEdge, "target">;

/** Every trigger a run could start from: a trigger with nothing wired into it. */
export function startingTriggers<T extends TriggerLike>(
  nodes: readonly T[],
  edges: readonly EdgeLike[],
): T[] {
  const targets = new Set(edges.map((edge) => edge.target));
  return nodes.filter(
    (node) => getCatalogEntry(node.type).category === "trigger" && !targets.has(node.id),
  );
}

/**
 * The trigger the next run starts from. A flow can have several starting triggers, so the caller
 * names the one it wants; a name that cannot start a run falls back to the first, which keeps a
 * stale selection from stopping the run.
 */
export function findSimulationTrigger<T extends NodeLike>(
  nodes: readonly T[],
  edges: readonly EdgeLike[],
  requestedId?: string | null,
): T | undefined {
  const starting = startingTriggers(nodes, edges);
  return starting.find((node) => node.id === requestedId) ?? starting[0];
}

export function triggerSamplePayload(node: Pick<FlowNode, "type" | "config">): unknown {
  const schema = configSchemas[node.type];
  if (!schema) return parseSamplePayload(node.config);
  try {
    return parseSamplePayload(parseNodeConfig(schema, node.config));
  } catch {
    return parseSamplePayload(node.config);
  }
}

export function simulationTriggerPayload(
  nodes: readonly NodeLike[],
  edges: readonly EdgeLike[],
  requestedId?: string | null,
): unknown {
  const trigger = findSimulationTrigger(nodes, edges, requestedId);
  return trigger ? triggerSamplePayload(trigger) : {};
}
