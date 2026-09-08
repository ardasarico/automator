import { flowChainId, type FlowDocumentInput } from "@automator/contracts";
import type { SQL } from "bun";

/** Layout and copy do not invalidate work; executable nodes and wiring do. */
export function executionConfiguration(flow: FlowDocumentInput) {
  return {
    version: flow.version,
    chainId: flowChainId(flow),
    nodes: flow.nodes.map(({ id, type, config }) => ({ id, type, config })),
    edges: flow.edges,
  };
}

/** Lock the same row as flow edits until the caller's state write commits. */
export async function lockCurrentPoll(tx: SQL, flowId: string, pollingRevision: string) {
  const rows = await tx<{ enabled: boolean; pollingRevision: string }[]>`
    SELECT enabled, polling_revision AS "pollingRevision" FROM automator_flows
    WHERE id = ${flowId} FOR UPDATE`;
  return rows[0]?.enabled === true && rows[0].pollingRevision === pollingRevision;
}
