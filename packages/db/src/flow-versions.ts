import type {
  FlowDocument,
  FlowDocumentInput,
  FlowVersionRecord,
  FlowVersionSummary,
} from "@automator/contracts";
import type { SQL } from "bun";

/** How many versions a flow keeps; older ones are pruned as new ones are recorded. */
export const flowVersionLimit = 50;

type Snapshot = Pick<FlowDocument, "version" | "chainId" | "nodes" | "edges">;

type VersionRow = {
  id: string;
  flowId: string;
  number: number;
  name: string;
  description: string;
  document: Snapshot;
  createdAt: Date;
};

/** What a version captures: the document as saved, without the flow id the row already names. */
export type FlowVersionInput = Pick<
  FlowDocumentInput,
  "version" | "chainId" | "name" | "description" | "nodes" | "edges"
>;

function toRecord(row: VersionRow): FlowVersionRecord {
  return {
    id: row.id,
    number: row.number,
    name: row.name,
    description: row.description,
    document: {
      version: row.document.version,
      id: row.flowId,
      name: row.name,
      description: row.description,
      ...(row.document.chainId === undefined ? {} : { chainId: row.document.chainId }),
      nodes: row.document.nodes,
      edges: row.document.edges,
    },
    createdAt: row.createdAt.toISOString(),
  };
}

const columns = `id, flow_id AS "flowId", number, name, description, document, created_at AS "createdAt"`;

/** Records and prunes within the caller's transaction, with the flow row already locked. */
export async function recordFlowVersion(
  tx: SQL,
  ownerId: string,
  flowId: string,
  input: FlowVersionInput,
): Promise<FlowVersionRecord | null> {
  const snapshot: Snapshot = {
    version: input.version,
    ...(input.chainId === undefined ? {} : { chainId: input.chainId }),
    nodes: input.nodes,
    edges: input.edges,
  };
  const rows = await tx<VersionRow[]>`
    INSERT INTO automator_flow_versions (id, flow_id, owner_id, number, name, description, document)
    SELECT ${crypto.randomUUID()}, f.id, f.owner_id,
      (SELECT COALESCE(MAX(v.number), 0) + 1 FROM automator_flow_versions v WHERE v.flow_id = f.id),
      ${input.name}, ${input.description}, ${snapshot}::jsonb
    FROM automator_flows f WHERE f.id = ${flowId} AND f.owner_id = ${ownerId}
    RETURNING ${tx.unsafe(columns)}`;
  if (!rows[0]) return null;
  await tx`
    DELETE FROM automator_flow_versions
    WHERE flow_id = ${flowId} AND number <= ${rows[0].number - flowVersionLimit}`;
  return toRecord(rows[0]);
}

/**
 * Save history per flow: every recorded version is an immutable snapshot of the document,
 * numbered from 1 in save order. Reads are owner-scoped like flows, and a flow that is gone
 * takes its versions with it.
 */
export function createFlowVersionStore(sql: SQL | undefined) {
  function connection() {
    if (!sql) throw new Error("Database is not configured");
    return sql;
  }
  return {
    /**
     * Appends a version with the next number for the flow and prunes anything older than the
     * newest `flowVersionLimit`, in one transaction. Answers `null` when the owner has no
     * such flow, so nothing is recorded for a flow that is not theirs.
     */
    async record(
      ownerId: string,
      flowId: string,
      input: FlowVersionInput,
    ): Promise<FlowVersionRecord | null> {
      const db = connection();
      return db.begin(async (tx) => {
        // Read MAX after taking the lock so a waiting writer sees the preceding commit.
        await tx`SELECT id FROM automator_flows
          WHERE id = ${flowId} AND owner_id = ${ownerId} FOR UPDATE`;
        return recordFlowVersion(tx, ownerId, flowId, input);
      });
    },
    /** Newest first; empty for a flow the owner does not have. */
    async list(ownerId: string, flowId: string): Promise<FlowVersionSummary[]> {
      const db = connection();
      const rows = await db<(Omit<FlowVersionSummary, "createdAt"> & { createdAt: Date })[]>`
        SELECT id, number, name, created_at AS "createdAt",
          jsonb_array_length(document->'nodes') AS "nodeCount"
        FROM automator_flow_versions
        WHERE owner_id = ${ownerId} AND flow_id = ${flowId}
        ORDER BY number DESC`;
      return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
    },
    async find(ownerId: string, flowId: string, number: number): Promise<FlowVersionRecord | null> {
      const db = connection();
      const rows = await db<VersionRow[]>`
        SELECT ${db.unsafe(columns)} FROM automator_flow_versions
        WHERE owner_id = ${ownerId} AND flow_id = ${flowId} AND number = ${number}`;
      return rows[0] ? toRecord(rows[0]) : null;
    },
  };
}
export type FlowVersionStore = ReturnType<typeof createFlowVersionStore>;
