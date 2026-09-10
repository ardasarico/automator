import { flowApiSchema, type FlowApiSummary } from "@automator/contracts";
import type { FlowRecord } from "@automator/contracts";
import type { FlowStore } from "@automator/db";

/*
 * Which of an owner's flows can be called, and what calling one looks like. `enabled` is the
 * publish switch, exactly as it is for webhooks: a draft is not reachable, an active flow is.
 */

/** The schema of one flow, or null when it is not callable. Pure; the store is the caller's. */
export function callableFlow(record: FlowRecord): FlowApiSummary | null {
  if (record.enabled !== true) return null;
  const schema = flowApiSchema(record.flow);
  return schema === null ? null : { id: record.flow.id, ...schema };
}

export async function listCallableFlows(
  flows: FlowStore,
  ownerId: string,
): Promise<FlowApiSummary[]> {
  const records = await flows.listEnabledForOwner(ownerId);
  return records.map(callableFlow).filter((flow): flow is FlowApiSummary => flow !== null);
}
