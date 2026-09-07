import { Type, type Static } from "@sinclair/typebox";
import { apiErrorResponses } from "./contract";

/**
 * What the signed-in user has built and run, as plain counts for the Settings dialog. Runs
 * are the stored ones started in the last thirty days, grouped by what started them (the
 * same `source` values the run history shows).
 */
const count = Type.Integer({ minimum: 0 });

export const accountUsageSchema = Type.Object({
  flows: count,
  /** Flows whose webhook and schedule triggers are switched on. */
  activeFlows: count,
  runsLast30Days: Type.Object({
    manual: count,
    webhook: count,
    schedule: count,
    miniapp: count,
  }),
  secrets: count,
  /** Marketplace listings the user has published. */
  listings: count,
  /** Start of the run window, as an ISO timestamp. */
  since: Type.String(),
});
export type AccountUsage = Static<typeof accountUsageSchema>;

export const accountUsageContract = {
  method: "GET",
  path: "/account/usage",
  response: { 200: accountUsageSchema, ...apiErrorResponses },
} as const;

/** Every stored run of the window, whatever started it. */
export function totalRuns(usage: Pick<AccountUsage, "runsLast30Days">): number {
  const runs = usage.runsLast30Days;
  return runs.manual + runs.webhook + runs.schedule + runs.miniapp;
}
