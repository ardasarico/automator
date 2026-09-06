import { Type, type Static } from "@sinclair/typebox";

/**
 * A flow as it appears in a list. The builder's full flow document is not modelled yet, so
 * this carries only what the flow browser renders. `updatedAt` is an ISO-8601 timestamp.
 */
export const flowSummarySchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  name: Type.String(),
  description: Type.String(),
  updatedAt: Type.String(),
});
export type FlowSummary = Static<typeof flowSummarySchema>;
