import type { AccountUsage, FlowRunSource } from "@automator/contracts";
import type { SQL } from "bun";

const windowMs = 30 * 24 * 60 * 60 * 1000;

export function createAccountStore(sql: SQL | undefined) {
  function connection() {
    if (!sql) throw new Error("Database is not configured");
    return sql;
  }
  return {
    async usage(ownerId: string, now: Date = new Date()): Promise<AccountUsage> {
      const db = connection();
      const since = new Date(now.getTime() - windowMs);
      type Totals = { flows: number; activeFlows: number; secrets: number; listings: number };
      const [totals] = await db<Totals[]>`
        SELECT
          (SELECT count(*) FROM automator_flows WHERE owner_id = ${ownerId})::int AS "flows",
          (SELECT count(*) FROM automator_flows WHERE owner_id = ${ownerId} AND enabled)::int AS "activeFlows",
          (SELECT count(*) FROM automator_secrets WHERE owner_id = ${ownerId})::int AS "secrets",
          (SELECT count(*) FROM automator_listings WHERE owner_id = ${ownerId})::int AS "listings"`;
      const runs = await db<{ source: FlowRunSource; count: number }[]>`
        SELECT source, count(*)::int AS count FROM automator_runs
        WHERE owner_id = ${ownerId} AND started_at >= ${since.toISOString()}::timestamptz
        GROUP BY source`;
      const runsLast30Days = { manual: 0, webhook: 0, schedule: 0, miniapp: 0, event: 0, watch: 0 };
      for (const row of runs) runsLast30Days[row.source] = row.count;
      return {
        flows: totals?.flows ?? 0,
        activeFlows: totals?.activeFlows ?? 0,
        runsLast30Days,
        secrets: totals?.secrets ?? 0,
        listings: totals?.listings ?? 0,
        since: since.toISOString(),
      };
    },
  };
}
export type AccountStore = ReturnType<typeof createAccountStore>;
