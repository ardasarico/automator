import {
  runListDefaultLimit,
  runListMaxLimit,
  runSortDefaults,
  type FlowDocument,
  type FlowRun,
  type FlowRunRecord,
  type FlowRunSource,
  type FlowRunStatus,
  type FlowRunSummary,
  type RunList,
  type RunSortDirection,
  type RunSortKey,
  type RunStats,
  type RunStatsDay,
} from "@automator/contracts";
import type { SQL } from "bun";

type Snapshot = Pick<FlowDocument, "version" | "chainId" | "nodes" | "edges" | "groups">;

/* The value the page stopped at, in whatever column the list is ordered by, plus the id that
 * breaks ties. Keyset paging, so a run inserted while reading cannot shift a page. */
type RunCursor = { key: string; id: string };

export class RunCursorError extends Error {
  constructor() {
    super("Run cursor is not readable");
    this.name = "RunCursorError";
  }
}

export function encodeRunCursor(cursor: RunCursor): string {
  return Buffer.from(JSON.stringify([cursor.key, cursor.id])).toString("base64url");
}

export function decodeRunCursor(value: string): RunCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new RunCursorError();
  }
  if (!Array.isArray(parsed) || parsed.length !== 2) throw new RunCursorError();
  const [key, id] = parsed as unknown[];
  if (typeof key !== "string" || key.length === 0) throw new RunCursorError();
  if (typeof id !== "string" || id.length === 0) throw new RunCursorError();
  return { key, id };
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
      ...(row.document.groups === undefined ? {} : { groups: row.document.groups }),
    },
  };
}

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
        ...(document.groups === undefined ? {} : { groups: document.groups }),
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
    async list(
      ownerId: string,
      options: {
        flowId?: string;
        status?: FlowRunStatus;
        limit?: number;
        cursor?: string;
        sort?: RunSortKey;
        direction?: RunSortDirection;
      } = {},
    ): Promise<RunList> {
      const db = connection();
      const limit = Math.min(Math.max(options.limit ?? runListDefaultLimit, 1), runListMaxLimit);
      const after = options.cursor === undefined ? null : decodeRunCursor(options.cursor);
      const sort = options.sort ?? "started";
      const direction = options.direction ?? runSortDefaults[sort];
      /* The column the list is ordered by, and the cast its cursor value needs to compare. */
      const order = {
        started: { column: db`r.started_at`, cast: "timestamptz" },
        flow: { column: db`f.name`, cast: "text" },
        status: { column: db`r.status`, cast: "text" },
        trigger: { column: db`r.source`, cast: "text" },
        duration: { column: db`r.finished_at - r.started_at`, cast: "interval" },
      }[sort];
      const at = after ? db`${after.key}::${db.unsafe(order.cast)}` : db``;
      const rows = await db<
        (FlowRunSummary & {
          startedAt: Date;
          finishedAt: Date;
          error: string | null;
          sortKey: string;
        })[]
      >`
        SELECT r.id, r.flow_id AS "flowId", f.name AS "flowName", r.status, r.source,
          r.started_at AS "startedAt", r.finished_at AS "finishedAt",
          r.result->>'error' AS "error",
          /* The exact value the next page must resume after, as the database rendered it. */
          (${order.column})::text AS "sortKey"
        FROM automator_runs r JOIN automator_flows f ON f.id = r.flow_id
        WHERE r.owner_id = ${ownerId} ${options.flowId ? db`AND r.flow_id = ${options.flowId}` : db``}
          ${options.status ? db`AND r.status = ${options.status}` : db``}
          ${
            after
              ? direction === "desc"
                ? db`AND ((${order.column}) < ${at}
                  OR ((${order.column}) = ${at} AND r.id > ${after.id}))`
                : db`AND ((${order.column}) > ${at}
                  OR ((${order.column}) = ${at} AND r.id > ${after.id}))`
              : db``
          }
        ORDER BY (${order.column}) ${db.unsafe(direction === "desc" ? "DESC" : "ASC")}, r.id
        LIMIT ${limit + 1}`;
      const page = rows.slice(0, limit);
      const runs = page.map(({ error, sortKey: _sortKey, ...row }) => ({
        ...row,
        startedAt: row.startedAt.toISOString(),
        finishedAt: row.finishedAt.toISOString(),
        ...(error ? { error } : {}),
      }));
      const last = page.at(-1);
      return rows.length > limit && last
        ? { runs, nextCursor: encodeRunCursor({ key: last.sortKey, id: last.id }) }
        : { runs };
    },
    /**
     * Runs counted by UTC day and outcome over a window, with the empty days filled in so the
     * chart has a bar slot for every day rather than a shorter axis.
     */
    async stats(ownerId: string, options: { flowId?: string; days: number }): Promise<RunStats> {
      const db = connection();
      const days = Math.min(Math.max(Math.trunc(options.days), 1), 90);
      const rows = await db<{ day: Date; status: FlowRunStatus; count: number }[]>`
        SELECT date_trunc('day', r.started_at AT TIME ZONE 'UTC') AS day,
          r.status, count(*)::int AS count
        FROM automator_runs r
        WHERE r.owner_id = ${ownerId}
          AND r.started_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') - make_interval(days => ${days - 1}))
          ${options.flowId ? db`AND r.flow_id = ${options.flowId}` : db``}
        GROUP BY 1, 2`;
      const buckets = new Map<string, RunStatsDay>();
      const today = new Date();
      for (let back = days - 1; back >= 0; back -= 1) {
        const at = new Date(
          Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - back),
        );
        const date = at.toISOString().slice(0, 10);
        buckets.set(date, { date, succeeded: 0, failed: 0, waiting: 0 });
      }
      const totals = { succeeded: 0, failed: 0, waiting: 0 };
      for (const row of rows) {
        totals[row.status] += row.count;
        /* The day comes back without a zone; its own date is what the bucket is keyed by. */
        const date = row.day.toISOString().slice(0, 10);
        const bucket = buckets.get(date);
        if (bucket) bucket[row.status] += row.count;
      }
      return { days: [...buckets.values()], totals };
    },
    async latestStartedAt(
      flowId: string,
      source: FlowRunSource,
      triggerNodeId?: string,
    ): Promise<Date | null> {
      const db = connection();
      const rows = await db<{ startedAt: Date }[]>`
        SELECT started_at AS "startedAt" FROM automator_runs
        WHERE flow_id = ${flowId} AND source = ${source}
          AND (${triggerNodeId ?? null}::text IS NULL OR result->'trigger'->>'nodeId' = ${triggerNodeId ?? null})
        ORDER BY started_at DESC LIMIT 1`;
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
