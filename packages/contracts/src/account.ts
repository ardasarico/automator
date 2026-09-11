import { Type, type Static } from "@sinclair/typebox";
import { apiErrorResponses } from "./contract";
import { flowRunSources, type FlowRunSource } from "./flow-runs";

const count = Type.Integer({ minimum: 0 });

/* One counter per run source; a source added to the list gains its counter here by itself. */
const runsBySourceSchema = Type.Object(
  Object.fromEntries(flowRunSources.map((source) => [source, count])) as Record<
    FlowRunSource,
    typeof count
  >,
);

export const accountUsageSchema = Type.Object({
  flows: count,
  activeFlows: count,
  runsLast30Days: runsBySourceSchema,
  secrets: count,
  listings: count,
  since: Type.String(),
});
export type AccountUsage = Static<typeof accountUsageSchema>;

export const accountUsageContract = {
  method: "GET",
  path: "/account/usage",
  response: { 200: accountUsageSchema, ...apiErrorResponses },
} as const;

export function totalRuns(usage: Pick<AccountUsage, "runsLast30Days">): number {
  const runs = usage.runsLast30Days;
  return flowRunSources.reduce((total, source) => total + runs[source], 0);
}
