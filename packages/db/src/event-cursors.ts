import type { SQL } from "bun";

/** Where the onchain-event listener got to for one trigger node of one flow. */
export interface EventCursor {
  flowId: string;
  nodeId: string;
  chainId: number;
  /** The last block whose logs were handled; polling resumes at the next one. */
  lastBlock: bigint;
}

/**
 * One row per (flow, trigger node), deleted with the flow. Block numbers are stored as
 * BIGINT and travel as text so they never pass through a JavaScript number.
 */
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
    /** Creates or moves the cursor; a chain change replaces the block outright. */
    async save(cursor: EventCursor): Promise<void> {
      const db = connection();
      await db`
        INSERT INTO automator_event_cursors (flow_id, node_id, chain_id, last_block)
        VALUES (${cursor.flowId}, ${cursor.nodeId}, ${cursor.chainId}, ${cursor.lastBlock.toString()}::bigint)
        ON CONFLICT (flow_id, node_id) DO UPDATE
          SET chain_id = EXCLUDED.chain_id, last_block = EXCLUDED.last_block, updated_at = now()`;
    },
  };
}
export type EventCursorStore = ReturnType<typeof createEventCursorStore>;
