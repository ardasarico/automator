import {
  isTriggerNodeType,
  type FlowDocument,
  type FlowNode,
  type FlowNodeType,
  type FlowRunSource,
} from "@automator/contracts";

/**
 * Which trigger types a run of each source started from. A run that resumes — every mini-app
 * session past its first screen — records no trigger node, because the engine only names one
 * when it starts the walk itself. The payload is still the opening trigger's, so the run detail
 * has a trigger to name and must not claim none fired; the source says which one it was.
 */
const sourceTriggerTypes: Record<FlowRunSource, readonly FlowNodeType[]> = {
  /* Simulate always sends the node it started from, so this list is never consulted for it. */
  manual: [],
  webhook: ["trigger.webhook"],
  schedule: ["trigger.schedule"],
  miniapp: ["trigger.miniapp-open"],
  event: ["trigger.onchain-event"],
  watch: ["trigger.price", "trigger.balance"],
  api: ["trigger.api"],
};

export interface RunTrigger {
  /** The node's id, kept even when the document no longer carries it. */
  id: string;
  /** The node as the executed document has it, or null when it is gone from that snapshot. */
  node: FlowNode | null;
}

/** The one node in `nodes`, or null when there is any doubt about which it is. */
function only(nodes: readonly FlowNode[]): FlowNode | null {
  return nodes.length === 1 ? nodes[0]! : null;
}

/**
 * The trigger node a stored run started from. Prefers what the run recorded; falls back to the
 * document when it recorded nothing, first to the trigger the source starts and then, for a
 * source that names none, to the document's only trigger. Answers null rather than guessing
 * between several equally likely ones — the caller then says no trigger fired.
 */
export function runTriggerNode(
  document: FlowDocument,
  source: FlowRunSource,
  nodeId: string | null,
): RunTrigger | null {
  if (nodeId) return { id: nodeId, node: document.nodes.find((n) => n.id === nodeId) ?? null };
  const types = sourceTriggerTypes[source];
  const node =
    only(document.nodes.filter((n) => types.includes(n.type))) ??
    only(document.nodes.filter((n) => isTriggerNodeType(n.type)));
  return node ? { id: node.id, node } : null;
}
