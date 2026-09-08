import type { SQL } from "bun";
import { lockCurrentPoll } from "./polling-fence";

export interface EventCursor {
  flowId: string;
  nodeId: string;
  chainId: number;
  lastBlock: bigint;
}

export function createEventCursorStore(sql: SQL | undefined) {
  function connection() {
    if (!sql) throw new Error("Database is not configured");
    return sql;
  }
  type Row = { flowId: string; nodeId: string; chainId: number; lastBlock: string };
  const toCursor = (row: Row): EventCursor => ({
    flowId: row.flowId,
    nodeId: row.nodeId,
    chainId: row.chainId,
    lastBlock: BigInt(row.lastBlock),
  });
  return {
    async find(flowId: string, nodeId: string): Promise<EventCursor | null> {
      const db = connection();
      const rows = await db<Row[]>`
        SELECT flow_id AS "flowId", node_id AS "nodeId", chain_id AS "chainId",
          last_block::text AS "lastBlock"
        FROM automator_event_cursors WHERE flow_id = ${flowId} AND node_id = ${nodeId}`;
      return rows[0] ? toCursor(rows[0]) : null;
    },
    async save(cursor: EventCursor, pollingRevision: string): Promise<boolean> {
      const db = connection();
      return db.begin(async (tx) => {
        if (!(await lockCurrentPoll(tx, cursor.flowId, pollingRevision))) return false;
        await tx`
        INSERT INTO automator_event_cursors (flow_id, node_id, chain_id, last_block)
        VALUES (${cursor.flowId}, ${cursor.nodeId}, ${cursor.chainId}, ${cursor.lastBlock.toString()}::bigint)
        ON CONFLICT (flow_id, node_id) DO UPDATE
          SET chain_id = EXCLUDED.chain_id, last_block = CASE WHEN automator_event_cursors.chain_id = EXCLUDED.chain_id
            THEN GREATEST(automator_event_cursors.last_block, EXCLUDED.last_block)
            ELSE EXCLUDED.last_block END, updated_at = now()`;
        return true;
      });
    },
  };
}
export type EventCursorStore = ReturnType<typeof createEventCursorStore>;
