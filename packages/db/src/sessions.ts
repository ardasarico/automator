import type { MiniAppSessionStatus } from "@automator/contracts";
import type { SQL } from "bun";

export interface MiniAppSessionRow {
  id: string;
  flowId: string;
  ownerId: string;
  tokenHash: string;
  status: MiniAppSessionStatus;
  nodeId: string | null;
  variables: Record<string, unknown>;
  payload: unknown;
  lastRunId: string | null;
  worldNonce: string | null;
  worldExpiresAt: number | null;
}

export function createSessionStore(sql: SQL | undefined) {
  function connection() {
    if (!sql) throw new Error("Database is not configured");
    return sql;
  }
  const columns = `id, flow_id AS "flowId", owner_id AS "ownerId", token_hash AS "tokenHash", status,
    node_id AS "nodeId", variables, payload, last_run_id AS "lastRunId",
    world_nonce AS "worldNonce", world_expires_at::double precision AS "worldExpiresAt"`;
  return {
    async create(row: MiniAppSessionRow): Promise<void> {
      const db = connection();
      await db`
        INSERT INTO automator_sessions (id, flow_id, owner_id, token_hash, status, node_id, variables, payload, last_run_id,
          world_nonce, world_expires_at)
        VALUES (${row.id}, ${row.flowId}, ${row.ownerId}, ${row.tokenHash}, ${row.status}, ${row.nodeId},
          ${row.variables}::jsonb, ${row.payload ?? null}::jsonb, ${row.lastRunId}, ${row.worldNonce}, ${row.worldExpiresAt})`;
    },
    async find(flowId: string, id: string): Promise<MiniAppSessionRow | null> {
      const db = connection();
      const rows = await db<MiniAppSessionRow[]>`
        SELECT ${db.unsafe(columns)} FROM automator_sessions WHERE flow_id = ${flowId} AND id = ${id}`;
      return rows[0] ?? null;
    },
    /* Claim before effects. A lost worker must leave a terminal failure, never a replayable screen. */
    async claim(row: MiniAppSessionRow): Promise<boolean> {
      const db = connection();
      const rows = await db<{ id: string }[]>`
        UPDATE automator_sessions SET status = 'failed', node_id = NULL, updated_at = now()
        WHERE id = ${row.id} AND flow_id = ${row.flowId} AND token_hash = ${row.tokenHash}
          AND status = 'screen' AND node_id = ${row.nodeId} AND last_run_id = ${row.lastRunId}
          AND world_nonce IS NOT DISTINCT FROM ${row.worldNonce}
          AND world_expires_at IS NOT DISTINCT FROM ${row.worldExpiresAt}
        RETURNING id`;
      return rows.length > 0;
    },
    async update(
      id: string,
      patch: Pick<
        MiniAppSessionRow,
        "status" | "nodeId" | "variables" | "lastRunId" | "worldNonce" | "worldExpiresAt"
      >,
    ): Promise<void> {
      const db = connection();
      await db`
        UPDATE automator_sessions SET status = ${patch.status}, node_id = ${patch.nodeId},
          variables = ${patch.variables}::jsonb, last_run_id = ${patch.lastRunId},
          world_nonce = ${patch.worldNonce}, world_expires_at = ${patch.worldExpiresAt}, updated_at = now()
        WHERE id = ${id}`;
    },
  };
}
export type SessionStore = ReturnType<typeof createSessionStore>;
