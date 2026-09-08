import type { FlowRunRecord, TriggerExecutionIssue } from "@automator/contracts";
import type { SQL } from "bun";

export interface TriggerClaimInput {
  flowId: string;
  nodeId: string;
  pollingRevision: string;
  source: "schedule" | "event" | "watch";
  occurrenceKey: string;
  at: Date;
  scheduleEveryMs?: number;
  watch?: { expectedObservationId: string | null; value: string };
}

export type TriggerClaimIssue = TriggerExecutionIssue;

export type TriggerClaimResult =
  | { kind: "claimed"; id: string }
  | { kind: "duplicate" | "blocked" | "stale" };

/**
 * Claims are durable admission records, not expiring leases. A lost worker may have sent
 * an external effect, so an unresolved claim prevents automatic execution of that trigger.
 * Finished occurrences stay in the ledger even when cursor/history persistence fails.
 */
export function createTriggerClaimStore(sql: SQL | undefined) {
  function connection() {
    if (!sql) throw new Error("Database is not configured");
    return sql;
  }
  return {
    async claim(input: TriggerClaimInput): Promise<TriggerClaimResult> {
      const db = connection();
      return db.begin(async (tx) => {
        // All polling state mutations take this lock first, including an absent watch row.
        const flows = await tx<{ enabled: boolean; revision: string }[]>`
          SELECT enabled, polling_revision AS revision FROM automator_flows
          WHERE id = ${input.flowId} FOR UPDATE`;
        if (!flows[0]?.enabled || flows[0].revision !== input.pollingRevision)
          return { kind: "stale" };
        const duplicate = await tx<{ id: string }[]>`
          SELECT id FROM automator_trigger_claims
          WHERE flow_id = ${input.flowId} AND node_id = ${input.nodeId}
            AND polling_revision = ${input.pollingRevision} AND source = ${input.source}
            AND occurrence_key = ${input.occurrenceKey} LIMIT 1`;
        if (duplicate.length) return { kind: "duplicate" };
        const unresolved = await tx<{ id: string }[]>`
          SELECT id FROM automator_trigger_claims WHERE flow_id = ${input.flowId}
            AND node_id = ${input.nodeId} AND status IN ('running', 'uncertain') LIMIT 1`;
        if (unresolved.length) return { kind: "blocked" };
        if (input.scheduleEveryMs !== undefined) {
          const recent = await tx<{ id: string }[]>`
            SELECT id FROM automator_trigger_claims WHERE flow_id = ${input.flowId}
              AND node_id = ${input.nodeId} AND source = 'schedule'
              AND started_at > ${new Date(input.at.getTime() - input.scheduleEveryMs)}
            ORDER BY started_at DESC LIMIT 1`;
          if (recent.length) return { kind: "duplicate" };
        }
        if (input.watch) {
          const previous = await tx<{ observationId: string; met: boolean }[]>`
            SELECT observation_id AS "observationId", met FROM automator_watch_state
            WHERE flow_id = ${input.flowId} AND node_id = ${input.nodeId}`;
          if ((previous[0]?.observationId ?? null) !== input.watch.expectedObservationId)
            return { kind: "stale" };
          if (previous[0]?.met) return { kind: "duplicate" };
        }
        const id = crypto.randomUUID();
        await tx`INSERT INTO automator_trigger_claims
          (id, flow_id, node_id, polling_revision, source, occurrence_key, status, started_at)
          VALUES (${id}, ${input.flowId}, ${input.nodeId}, ${input.pollingRevision},
            ${input.source}, ${input.occurrenceKey}, 'running', ${input.at})`;
        if (input.watch) {
          await tx`INSERT INTO automator_watch_state (flow_id, node_id, met, value, observation_id)
            VALUES (${input.flowId}, ${input.nodeId}, true, ${input.watch.value}, ${crypto.randomUUID()})
            ON CONFLICT (flow_id, node_id) DO UPDATE SET met = true, value = EXCLUDED.value,
              observation_id = EXCLUDED.observation_id, updated_at = now()`;
        }
        return { kind: "claimed", id };
      });
    },
    async listIssues(ownerId: string, flowId: string): Promise<TriggerClaimIssue[]> {
      const db = connection();
      const rows = await db<(Omit<TriggerClaimIssue, "startedAt"> & { startedAt: Date })[]>`
        SELECT c.id, c.node_id AS "nodeId", c.source, c.status, c.started_at AS "startedAt",
          c.history_saved AS "historySaved", c.run_record AS record
        FROM automator_trigger_claims c JOIN automator_flows f ON f.id = c.flow_id
        WHERE c.flow_id = ${flowId} AND f.owner_id = ${ownerId}
          AND (c.status <> 'completed' OR NOT c.history_saved)
        ORDER BY c.started_at DESC, c.id LIMIT 50`;
      return rows.map((row) => ({ ...row, startedAt: row.startedAt.toISOString() }));
    },
    async latestStartedAt(flowId: string, nodeId: string): Promise<Date | null> {
      const db = connection();
      const rows = await db<{ at: Date }[]>`SELECT started_at AS at FROM automator_trigger_claims
        WHERE flow_id = ${flowId} AND node_id = ${nodeId} AND source = 'schedule'
        ORDER BY started_at DESC LIMIT 1`;
      return rows[0]?.at ?? null;
    },
    /** Retain the complete evidence independently of the ordinary run-history write. */
    async complete(id: string, record: FlowRunRecord, historySaved: boolean): Promise<void> {
      const db = connection();
      await db`UPDATE automator_trigger_claims SET status = 'completed', run_record = ${record}::jsonb,
        history_saved = ${historySaved}, updated_at = now() WHERE id = ${id} AND status = 'running'`;
    },
    async markUncertain(id: string): Promise<void> {
      const db = connection();
      await db`UPDATE automator_trigger_claims SET status = 'uncertain', updated_at = now()
        WHERE id = ${id} AND status = 'running'`;
    },
  };
}
export type TriggerClaimStore = ReturnType<typeof createTriggerClaimStore>;
