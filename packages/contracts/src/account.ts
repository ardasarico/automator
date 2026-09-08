import { Type, type Static } from "@sinclair/typebox";
import { apiErrorResponses } from "./contract";

const count = Type.Integer({ minimum: 0 });

export const accountUsageSchema = Type.Object({
  flows: count,
  activeFlows: count,
  runsLast30Days: Type.Object({
    manual: count,
    webhook: count,
    schedule: count,
    miniapp: count,
    event: count,
    watch: count,
  }),
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
  return runs.manual + runs.webhook + runs.schedule + runs.miniapp + runs.event + runs.watch;
}
