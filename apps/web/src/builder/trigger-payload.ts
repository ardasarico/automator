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

type NodeLike = Pick<FlowNode, "id" | "type" | "config">;
type EdgeLike = Pick<FlowEdge, "target">;

export function findSimulationTrigger<T extends NodeLike>(
  nodes: readonly T[],
  edges: readonly EdgeLike[],
): T | undefined {
  const targets = new Set(edges.map((edge) => edge.target));
  return nodes.find(
    (node) => getCatalogEntry(node.type).category === "trigger" && !targets.has(node.id),
  );
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
): unknown {
  const trigger = findSimulationTrigger(nodes, edges);
  return trigger ? triggerSamplePayload(trigger) : {};
}
