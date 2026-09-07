import type {
  FlowDocument,
  FlowRun,
  FlowRunRecord,
  FlowRunSource,
  FlowRunSummary,
} from "@automator/contracts";
import type { SQL } from "bun";

type Snapshot = Pick<FlowDocument, "version" | "nodes" | "edges">;

type RunRow = {
  id: string;
  flowId: string;
  flowName: string;
  name: string;
  description: string;
  document: Snapshot;
  result: FlowRun;
  source: FlowRunSource;
};

function toRecord(row: RunRow): FlowRunRecord {
  return {
    run: row.result,
    flowName: row.flowName,
    source: row.source,
    document: {
      version: row.document.version,
      id: row.flowId,
      name: row.name,
      description: row.description,
      nodes: row.document.nodes,
      edges: row.document.edges,
    },
  };
}

/**
 * Runs are immutable records of one execution: the finished `FlowRun` plus the document it
 * executed, so history stays readable after the flow changes. Reads are owner-scoped like
 * flows; the flow's current name is joined at read time.
 */
export function createRunStore(sql: SQL | undefined) {
  function connection() {
    if (!sql) throw new Error("Database is not configured");
    return sql;
  }
  return {
    async create(
      ownerId: string,
      document: FlowDocument,
      run: FlowRun,
      source: FlowRunSource = "manual",
    ): Promise<FlowRunRecord> {
      const db = connection();
      const snapshot: Snapshot = {
        version: document.version,
        nodes: document.nodes,
        edges: document.edges,
      };
      const rows = await db<RunRow[]>`
        WITH inserted AS (
          INSERT INTO automator_runs (id, flow_id, owner_id, status, source, name, description, document, result, started_at, finished_at)
          VALUES (${run.id}, ${document.id}, ${ownerId}, ${run.status}, ${source}, ${document.name}, ${document.description},
            ${snapshot}::jsonb, ${run}::jsonb, ${run.startedAt}::timestamptz, ${run.finishedAt}::timestamptz)
          RETURNING id, flow_id, name, description, document, result, source
        )
        SELECT i.id, i.flow_id AS "flowId", f.name AS "flowName", i.name, i.description, i.document, i.result, i.source
        FROM inserted i JOIN automator_flows f ON f.id = i.flow_id`;
      if (!rows[0]) throw new Error("Run creation failed");
      return toRecord(rows[0]);
    },
    /** Newest first; `flowId` narrows to one flow, `limit` caps the page. */
    async list(
      ownerId: string,
      options: { flowId?: string; limit?: number } = {},
    ): Promise<FlowRunSummary[]> {
      const db = connection();
      const limit = options.limit ?? 50;
      const rows = await db<(FlowRunSummary & { startedAt: Date; finishedAt: Date })[]>`
        SELECT r.id, r.flow_id AS "flowId", f.name AS "flowName", r.status, r.source,
          r.started_at AS "startedAt", r.finished_at AS "finishedAt"
        FROM automator_runs r JOIN automator_flows f ON f.id = r.flow_id
        WHERE r.owner_id = ${ownerId} ${options.flowId ? db`AND r.flow_id = ${options.flowId}` : db``}
        ORDER BY r.started_at DESC, r.id LIMIT ${limit}`;
      return rows.map((row) => ({
        ...row,
        startedAt: row.startedAt.toISOString(),
        finishedAt: row.finishedAt.toISOString(),
      }));
    },
    /** When the flow's newest run from `source` started, or `null` without one; for the scheduler. */
    async latestStartedAt(flowId: string, source: FlowRunSource): Promise<Date | null> {
      const db = connection();
      const rows = await db<{ startedAt: Date }[]>`
        SELECT started_at AS "startedAt" FROM automator_runs
        WHERE flow_id = ${flowId} AND source = ${source} ORDER BY started_at DESC LIMIT 1`;
      return rows[0]?.startedAt ?? null;
    },
    async find(ownerId: string, id: string): Promise<FlowRunRecord | null> {
      const db = connection();
      const rows = await db<RunRow[]>`
        SELECT r.id, r.flow_id AS "flowId", f.name AS "flowName", r.name, r.description, r.document, r.result, r.source
        FROM automator_runs r JOIN automator_flows f ON f.id = r.flow_id
        WHERE r.owner_id = ${ownerId} AND r.id = ${id}`;
      return rows[0] ? toRecord(rows[0]) : null;
    },
  };
}
export type RunStore = ReturnType<typeof createRunStore>;
