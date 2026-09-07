import {
  runListDefaultLimit,
  runListMaxLimit,
  type FlowDocument,
  type FlowRun,
  type FlowRunRecord,
  type FlowRunSource,
  type FlowRunSummary,
  type RunList,
} from "@automator/contracts";
import type { SQL } from "bun";

type Snapshot = Pick<FlowDocument, "version" | "chainId" | "nodes" | "edges">;

/** Where a page of runs stopped: the last row's sort key, `(started_at DESC, id)`. */
type RunCursor = { startedAt: string; id: string };

/** Raised when a list cursor is not one this store produced; callers answer a bad request. */
export class RunCursorError extends Error {
  constructor() {
    super("Run cursor is not readable");
    this.name = "RunCursorError";
  }
}

/**
 * Cursors are base64url JSON of the sort key. They are opaque to clients, so the encoding can
 * change freely; the ISO timestamp keeps millisecond precision, which is what runs store.
 */
export function encodeRunCursor(cursor: RunCursor): string {
  return Buffer.from(JSON.stringify([cursor.startedAt, cursor.id])).toString("base64url");
}

export function decodeRunCursor(value: string): RunCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new RunCursorError();
  }
  if (!Array.isArray(parsed) || parsed.length !== 2) throw new RunCursorError();
  const [startedAt, id] = parsed as unknown[];
  if (typeof startedAt !== "string" || typeof id !== "string" || id.length === 0)
    throw new RunCursorError();
  if (Number.isNaN(Date.parse(startedAt))) throw new RunCursorError();
  return { startedAt, id };
}

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
      ...(row.document.chainId === undefined ? {} : { chainId: row.document.chainId }),
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
        ...(document.chainId === undefined ? {} : { chainId: document.chainId }),
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
    /**
     * One page, newest first; `flowId` narrows to one flow. `cursor` is the previous page's
     * `nextCursor`; a cursor that does not decode throws `RunCursorError`. The page holds up
     * to `limit` runs (the contract default when absent, capped at the contract maximum).
     */
    async list(
      ownerId: string,
      options: { flowId?: string; limit?: number; cursor?: string } = {},
    ): Promise<RunList> {
      const db = connection();
      const limit = Math.min(Math.max(options.limit ?? runListDefaultLimit, 1), runListMaxLimit);
      const after = options.cursor === undefined ? null : decodeRunCursor(options.cursor);
      // One row beyond the page tells whether another page exists without a second query.
      const rows = await db<(FlowRunSummary & { startedAt: Date; finishedAt: Date })[]>`
        SELECT r.id, r.flow_id AS "flowId", f.name AS "flowName", r.status, r.source,
          r.started_at AS "startedAt", r.finished_at AS "finishedAt"
        FROM automator_runs r JOIN automator_flows f ON f.id = r.flow_id
        WHERE r.owner_id = ${ownerId} ${options.flowId ? db`AND r.flow_id = ${options.flowId}` : db``}
          ${
            after
              ? db`AND (r.started_at < ${after.startedAt}::timestamptz
                OR (r.started_at = ${after.startedAt}::timestamptz AND r.id > ${after.id}))`
              : db``
          }
        ORDER BY r.started_at DESC, r.id LIMIT ${limit + 1}`;
      const page = rows.slice(0, limit);
      const runs = page.map((row) => ({
        ...row,
        startedAt: row.startedAt.toISOString(),
        finishedAt: row.finishedAt.toISOString(),
      }));
      const last = runs.at(-1);
      return rows.length > limit && last
        ? { runs, nextCursor: encodeRunCursor({ startedAt: last.startedAt, id: last.id }) }
        : { runs };
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
    /**
     * The newest `limit` full records (result and document snapshot), newest first, for
     * scans over what recent runs produced such as the wallet's transaction list.
     */
    async listRecords(ownerId: string, limit: number): Promise<FlowRunRecord[]> {
      const db = connection();
      const rows = await db<RunRow[]>`
        SELECT r.id, r.flow_id AS "flowId", f.name AS "flowName", r.name, r.description, r.document, r.result, r.source
        FROM automator_runs r JOIN automator_flows f ON f.id = r.flow_id
        WHERE r.owner_id = ${ownerId}
        ORDER BY r.started_at DESC, r.id LIMIT ${limit}`;
      return rows.map(toRecord);
    },
  };
}
export type RunStore = ReturnType<typeof createRunStore>;
