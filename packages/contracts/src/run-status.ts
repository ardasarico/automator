import { Type } from "@sinclair/typebox";

export const flowRunStatuses = ["succeeded", "failed", "waiting"] as const;
export type FlowRunStatus = (typeof flowRunStatuses)[number];
/* Unsafe preserves the literal union that mapping to Type.Union would widen. */
export const flowRunStatusSchema = Type.Unsafe<FlowRunStatus>(
  Type.Union(flowRunStatuses.map((status) => Type.Literal(status))),
);

/** Narrows a status read from a query string, which arrives as an arbitrary string. */
export function isFlowRunStatus(value: string): value is FlowRunStatus {
  return (flowRunStatuses as readonly string[]).includes(value);
}
