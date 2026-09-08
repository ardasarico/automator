import type { SQL } from "bun";
import { lockCurrentPoll } from "./polling-fence";

/** What a watch trigger saw on its last poll, so the next one can spot the crossing. */
export interface WatchState {
  flowId: string;
  nodeId: string;
  /** Whether the comparison held at the last poll. */
  met: boolean;
  /** The reading as a decimal string, for the log and the run panel. */
  value: string;
  /** Identifies this observation for compare-and-set crossing consumption. */
  observationId: string;
}

/**
 * One row per (flow, watch trigger node), deleted with the flow. The row is the whole memory
 * of a watcher: without it every poll of a true condition would start another run.
 */
export function createWatchStateStore(sql: SQL | undefined) {
  function connection() {
    if (!sql) throw new Error("Database is not configured");
    return sql;
  }
  return {
    async find(flowId: string, nodeId: string): Promise<WatchState | null> {
      const db = connection();
      const rows = await db<WatchState[]>`
        SELECT flow_id AS "flowId", node_id AS "nodeId", met, value, observation_id AS "observationId"
        FROM automator_watch_state WHERE flow_id = ${flowId} AND node_id = ${nodeId}`;
      return rows[0] ?? null;
    },
    async save(
      state: Omit<WatchState, "observationId">,
      pollingRevision: string,
      expectedObservationId: string | null,
    ): Promise<boolean> {
      const db = connection();
      return db.begin(async (tx) => {
        if (!(await lockCurrentPoll(tx, state.flowId, pollingRevision))) return false;
        const previous = await tx<{ observationId: string }[]>`
          SELECT observation_id AS "observationId" FROM automator_watch_state
          WHERE flow_id = ${state.flowId} AND node_id = ${state.nodeId}`;
        if ((previous[0]?.observationId ?? null) !== expectedObservationId) return false;
        await tx`
          INSERT INTO automator_watch_state (flow_id, node_id, met, value, observation_id)
          VALUES (${state.flowId}, ${state.nodeId}, ${state.met}, ${state.value}, ${crypto.randomUUID()})
          ON CONFLICT (flow_id, node_id) DO UPDATE
            SET met = EXCLUDED.met, value = EXCLUDED.value,
                observation_id = EXCLUDED.observation_id, updated_at = now()`;
        return true;
      });
    },
  };
}
export type WatchStateStore = ReturnType<typeof createWatchStateStore>;
