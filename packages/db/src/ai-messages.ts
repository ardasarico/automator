import type { AiMessage, AiPart } from "@automator/contracts";
import type { SQL } from "bun";

export interface AiMessageStore {
  list(flowId: string): Promise<AiMessage[]>;
  append(flowId: string, message: Omit<AiMessage, "createdAt">): Promise<AiMessage>;
  setProposalState(
    flowId: string,
    messageId: string,
    state: "applied" | "discarded",
  ): Promise<AiMessage | null>;
  /** Sending a new message supersedes every proposal still waiting for a decision. */
  markPendingStale(flowId: string): Promise<void>;
  clear(flowId: string): Promise<boolean>;
}

type Row = {
  id: string;
  role: AiMessage["role"];
  parts: AiPart[];
  context: AiMessage["context"] | null;
  createdAt: Date;
};

const columns = `id, role, parts, context, created_at AS "createdAt"`;

function toMessage(row: Row): AiMessage {
  return {
    id: row.id,
    role: row.role,
    parts: row.parts,
    ...(row.context === null ? {} : { context: row.context }),
    createdAt: row.createdAt.toISOString(),
  };
}

export function createAiMessageStore(sql: SQL | undefined): AiMessageStore {
  const connection = () => {
    if (!sql) throw new Error("Database is not configured");
    return sql;
  };
  return {
    async list(flowId) {
      const db = connection();
      const rows = await db<Row[]>`
        SELECT ${db.unsafe(columns)} FROM automator_flow_ai_messages
        WHERE flow_id = ${flowId}
        ORDER BY created_at ASC, id ASC`;
      return rows.map(toMessage);
    },
    async append(flowId, message) {
      const db = connection();
      // Bun SQL parses a JS value into the ::jsonb target itself; JSON.stringify-ing it first
      // double-encodes the column into a JSON string. See how flows.ts inserts `document`.
      const rows = await db<Row[]>`
        INSERT INTO automator_flow_ai_messages (id, flow_id, role, parts, context)
        VALUES (
          ${message.id}, ${flowId}, ${message.role},
          ${message.parts}::jsonb,
          ${message.context === undefined ? null : message.context}::jsonb
        )
        RETURNING ${db.unsafe(columns)}`;
      return toMessage(rows[0]!);
    },
    // Both updates below rewrite `parts` in a single correlated-subquery UPDATE, so the read of
    // the current parts and the write happen atomically under the row lock the UPDATE itself
    // takes. A SELECT-then-mutate-in-JS-then-UPDATE would lose a write under concurrent calls.
    async setProposalState(flowId, messageId, state) {
      const db = connection();
      const rows = await db<Row[]>`
        UPDATE automator_flow_ai_messages SET parts = (
          SELECT COALESCE(jsonb_agg(
            CASE WHEN p->>'type' = 'proposal'
              THEN p || jsonb_build_object('state', ${state}::text)
              ELSE p END
            ORDER BY ord), '[]'::jsonb)
          FROM jsonb_array_elements(parts) WITH ORDINALITY AS t(p, ord)
        )
        WHERE flow_id = ${flowId} AND id = ${messageId}
        RETURNING ${db.unsafe(columns)}`;
      return rows[0] ? toMessage(rows[0]) : null;
    },
    async markPendingStale(flowId) {
      const db = connection();
      await db`
        UPDATE automator_flow_ai_messages SET parts = (
          SELECT COALESCE(jsonb_agg(
            CASE WHEN p->>'type' = 'proposal' AND p->>'state' = 'pending'
              THEN p || jsonb_build_object('state', 'stale')
              ELSE p END
            ORDER BY ord), '[]'::jsonb)
          FROM jsonb_array_elements(parts) WITH ORDINALITY AS t(p, ord)
        )
        WHERE flow_id = ${flowId} AND parts @> '[{"type":"proposal","state":"pending"}]'::jsonb`;
    },
    async clear(flowId) {
      const db = connection();
      const rows = await db<{ id: string }[]>`
        DELETE FROM automator_flow_ai_messages WHERE flow_id = ${flowId} RETURNING id`;
      return rows.length > 0;
    },
  };
}
