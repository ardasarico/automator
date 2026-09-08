import { dataRecordListDefaultLimit, dataRecordListMaxLimit } from "@automator/contracts";
import type { ConditionOperator, DataRecord, DataRecordList } from "@automator/contracts";
import type { SQL } from "bun";
import { countTableRecords, DataLimitError } from "./data-tables";

/** How many records one table may hold. */
export const dataRecordLimit = 50_000;
/** How large one record's serialized values may be. */
export const dataRecordMaxBytes = 100 * 1024;

export class DataRecordCursorError extends Error {
  constructor() {
    super("Data record cursor is not readable");
    this.name = "DataRecordCursorError";
  }
}

export type DataRecordCursor = { createdAt: string; id: string };

export function encodeDataRecordCursor(cursor: DataRecordCursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt, cursor.id])).toString("base64url");
}

export function decodeDataRecordCursor(value: string): DataRecordCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new DataRecordCursorError();
  }
  if (!Array.isArray(parsed) || parsed.length !== 2) throw new DataRecordCursorError();
  const [createdAt, id] = parsed as unknown[];
  if (typeof createdAt !== "string" || typeof id !== "string" || id.length === 0)
    throw new DataRecordCursorError();
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== createdAt)
    throw new DataRecordCursorError();
  return { createdAt, id };
}

export type DataRecordFilter = {
  column: string;
  operator: ConditionOperator;
  value?: unknown;
};
export type DataRecordSort = { column: string; direction: "asc" | "desc" };
export type DataRecordQuery = {
  filters?: readonly DataRecordFilter[];
  sort?: DataRecordSort;
  limit?: number;
};

type RecordRow = {
  id: string;
  tableId: string;
  values: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

const columns = `id, table_id AS "tableId", "values", created_at AS "createdAt",
  updated_at AS "updatedAt"`;

function toRecord(row: RecordRow): DataRecord {
  return {
    id: row.id,
    tableId: row.tableId,
    values: row.values,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Throws once the table is at its record cap. Exported so the guard is testable without 50,000 rows. */
export function assertRecordCapacity(count: number): void {
  if (count >= dataRecordLimit)
    throw new DataLimitError(`A table can hold at most ${dataRecordLimit} records.`);
}

/** Throws when the serialized record is too large; returns its byte size otherwise. */
export function assertRecordSize(values: Record<string, unknown>): number {
  const bytes = Buffer.byteLength(JSON.stringify(values ?? {}), "utf8");
  if (bytes > dataRecordMaxBytes)
    throw new DataLimitError(`A record can be at most ${dataRecordMaxBytes} bytes.`);
  return bytes;
}

const numericText = "^-?[0-9]+(\\.[0-9]+)?$";

function asText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? "";
}

/**
 * One filter as a SQL predicate over the record's JSONB `values`. Comparisons run on the text form
 * of the stored value, numerically only when both sides look like numbers.
 */
function filterCondition(db: SQL, filter: DataRecordFilter) {
  const column = filter.column;
  const value = asText(filter.value);
  switch (filter.operator) {
    case "equals":
      return db`r."values"->>${column} = ${value}`;
    case "not_equals":
      return db`r."values"->>${column} IS DISTINCT FROM ${value}`;
    case "contains":
      return db`strpos(lower(coalesce(r."values"->>${column}, '')), lower(${value})) > 0`;
    case "greater_than":
    case "less_than": {
      const numeric = value.trim() !== "" && Number.isFinite(Number(value));
      const comparison =
        filter.operator === "greater_than"
          ? numeric
            ? db`CASE WHEN (r."values"->>${column}) ~ ${numericText}
                  THEN (r."values"->>${column})::numeric > ${value}::numeric
                  ELSE (r."values"->>${column}) > ${value} END`
            : db`(r."values"->>${column}) > ${value}`
          : numeric
            ? db`CASE WHEN (r."values"->>${column}) ~ ${numericText}
                  THEN (r."values"->>${column})::numeric < ${value}::numeric
                  ELSE (r."values"->>${column}) < ${value} END`
            : db`(r."values"->>${column}) < ${value}`;
      // A record without the value never orders above or below anything.
      return db`(r."values"->>${column} IS NOT NULL AND ${comparison})`;
    }
    case "is_empty":
      return db`coalesce(r."values"->>${column}, '') = ''`;
    case "is_not_empty":
      return db`coalesce(r."values"->>${column}, '') <> ''`;
  }
}

/* Keep queries as tagged templates: Bun does not decode JSONB from parameterized unsafe queries. */
export function createDataRecordStore(sql: SQL | undefined) {
  function connection() {
    if (!sql) throw new Error("Database is not configured");
    return sql;
  }
  return {
    async list(
      ownerId: string,
      tableId: string,
      options: { cursor?: string; limit?: number } = {},
    ): Promise<DataRecordList> {
      const db = connection();
      const limit = Math.min(
        Math.max(options.limit ?? dataRecordListDefaultLimit, 1),
        dataRecordListMaxLimit,
      );
      const after = options.cursor === undefined ? null : decodeDataRecordCursor(options.cursor);
      const rows = await db<RecordRow[]>`
        SELECT ${db.unsafe(columns)} FROM automator_data_records r
        WHERE r.owner_id = ${ownerId} AND r.table_id = ${tableId}
          ${
            after
              ? db`AND (r.created_at < ${after.createdAt}::timestamptz
                OR (r.created_at = ${after.createdAt}::timestamptz AND r.id < ${after.id}))`
              : db``
          }
        ORDER BY r.created_at DESC, r.id DESC LIMIT ${limit + 1}`;
      const records = rows.slice(0, limit).map(toRecord);
      const last = records.at(-1);
      return rows.length > limit && last
        ? {
            records,
            nextCursor: encodeDataRecordCursor({
              createdAt: last.createdAt,
              id: last.id,
            }),
          }
        : { records };
    },
    async get(ownerId: string, tableId: string, id: string): Promise<DataRecord | null> {
      const db = connection();
      const rows = await db<RecordRow[]>`
        SELECT ${db.unsafe(columns)} FROM automator_data_records r
        WHERE r.owner_id = ${ownerId} AND r.table_id = ${tableId} AND r.id = ${id}`;
      return rows[0] ? toRecord(rows[0]) : null;
    },
    async find(
      ownerId: string,
      tableId: string,
      query: DataRecordQuery = {},
    ): Promise<DataRecord[]> {
      const db = connection();
      const limit = Math.min(
        Math.max(query.limit ?? dataRecordListDefaultLimit, 1),
        dataRecordListMaxLimit,
      );
      let conditions = db``;
      for (const filter of query.filters ?? [])
        conditions = db`${conditions} AND ${filterCondition(db, filter)}`;
      const sort = query.sort;
      const order = !sort
        ? db``
        : sort.direction === "asc"
          ? db`r."values"->>${sort.column} ASC NULLS LAST,`
          : db`r."values"->>${sort.column} DESC NULLS LAST,`;
      const rows = await db<RecordRow[]>`
        SELECT ${db.unsafe(columns)} FROM automator_data_records r
        WHERE r.owner_id = ${ownerId} AND r.table_id = ${tableId} ${conditions}
        ORDER BY ${order} r.created_at DESC, r.id DESC LIMIT ${limit}`;
      return rows.map(toRecord);
    },
    async create(
      ownerId: string,
      tableId: string,
      values: Record<string, unknown>,
    ): Promise<DataRecord | null> {
      assertRecordSize(values);
      const db = connection();
      return db.begin(async (tx) => {
        // The table row serialises concurrent inserts, so the cap cannot be raced past.
        const table = await tx`SELECT id FROM automator_data_tables
          WHERE owner_id = ${ownerId} AND id = ${tableId} FOR UPDATE`;
        if (!table.length) return null;
        assertRecordCapacity(await countTableRecords(tx, tableId));
        const rows = await tx<RecordRow[]>`
          INSERT INTO automator_data_records (id, table_id, owner_id, "values")
          VALUES (${crypto.randomUUID()}, ${tableId}, ${ownerId}, ${values}::jsonb)
          RETURNING ${tx.unsafe(columns)}`;
        if (!rows[0]) throw new Error("Data record creation failed");
        return toRecord(rows[0]);
      });
    },
    async update(
      ownerId: string,
      tableId: string,
      id: string,
      values: Record<string, unknown>,
    ): Promise<DataRecord | null> {
      assertRecordSize(values);
      const db = connection();
      const rows = await db<RecordRow[]>`
        UPDATE automator_data_records r
        SET "values" = ${values}::jsonb, updated_at = now()
        WHERE r.owner_id = ${ownerId} AND r.table_id = ${tableId} AND r.id = ${id}
        RETURNING ${db.unsafe(columns)}`;
      return rows[0] ? toRecord(rows[0]) : null;
    },
    async remove(ownerId: string, tableId: string, id: string): Promise<DataRecord | null> {
      const db = connection();
      const rows = await db<RecordRow[]>`
        DELETE FROM automator_data_records r
        WHERE r.owner_id = ${ownerId} AND r.table_id = ${tableId} AND r.id = ${id}
        RETURNING ${db.unsafe(columns)}`;
      return rows[0] ? toRecord(rows[0]) : null;
    },
  };
}
export type DataRecordStore = ReturnType<typeof createDataRecordStore>;
