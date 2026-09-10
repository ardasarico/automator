import { dataTableMaxColumns, type DataColumn, type DataTable } from "@automator/contracts";
import type { DataTableInput } from "@automator/contracts";
import type { SQL, TransactionSQL } from "bun";

/** How many tables one account may own. */
export const dataTableLimit = 50;

/** A cap was reached: the table count, the column count, the record count or the record size. */
export class DataLimitError extends Error {}
/** A stored column's type cannot change once the table holds records. */
export class DataColumnTypeLockedError extends Error {}
/** Two columns in the same table share an id. */
export class DataColumnDuplicateError extends Error {}
/** The owner row is gone, so the table cannot be created. */
export class DataTableOwnerMissingError extends Error {}

type Connection = SQL | TransactionSQL;

type TableRow = {
  id: string;
  name: string;
  description: string | null;
  columns: DataColumn[];
  recordCount: number;
  createdAt: Date;
  updatedAt: Date;
};

function toTable(row: TableRow): DataTable {
  return {
    id: row.id,
    name: row.name,
    ...(row.description === null ? {} : { description: row.description }),
    columns: row.columns,
    recordCount: row.recordCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Rejects a column list that is too long or names the same column id twice. */
function assertColumns(columns: readonly DataColumn[]): void {
  if (columns.length > dataTableMaxColumns)
    throw new DataLimitError(`A table can have at most ${dataTableMaxColumns} columns.`);
  const seen = new Set<string>();
  for (const column of columns) {
    if (seen.has(column.id))
      throw new DataColumnDuplicateError(`Column "${column.id}" is defined twice.`);
    seen.add(column.id);
  }
}

/** Rejects a type change on a column that already has stored values behind it. */
function assertColumnTypesUnchanged(
  before: readonly DataColumn[],
  after: readonly DataColumn[],
): void {
  const previous = new Map(before.map((column) => [column.id, column]));
  for (const column of after) {
    const existing = previous.get(column.id);
    if (existing && existing.type !== column.type)
      throw new DataColumnTypeLockedError(
        `"${existing.name}" cannot change type while the table has records.`,
      );
  }
}

/** The JSON type each column type accepts in a stored record value. */
const storedJsonTypes: Record<DataColumn["type"], string> = {
  text: "string",
  number: "number",
  checkbox: "boolean",
  datetime: "string",
  select: "string",
  address: "string",
};

/**
 * A dropped column keeps its values inside every record, so re-adding the id under another type
 * would slip past the type lock. Rejects a reintroduced column whose type disagrees with the JSON
 * type still stored under it.
 */
async function assertReintroducedColumnsMatchValues(
  tx: Connection,
  tableId: string,
  before: readonly DataColumn[],
  after: readonly DataColumn[],
): Promise<void> {
  const known = new Set(before.map((column) => column.id));
  const added = new Map(
    after.filter((column) => !known.has(column.id)).map((column) => [column.id, column]),
  );
  if (!added.size) return;
  // Column ids cannot hold a comma, so the joined list survives the round trip through Postgres.
  const ids = [...added.keys()].join(",");
  const stored = await tx<{ key: string; type: string }[]>`
    SELECT DISTINCT entry.key AS key, jsonb_typeof(entry.value) AS type
    FROM automator_data_records r, jsonb_each(r."values") AS entry
    WHERE r.table_id = ${tableId}
      AND entry.key = ANY(string_to_array(${ids}, ','))
      AND jsonb_typeof(entry.value) <> 'null'`;
  for (const row of stored) {
    const column = added.get(row.key);
    if (column && storedJsonTypes[column.type] !== row.type)
      throw new DataColumnTypeLockedError(
        `"${column.name}" cannot change type while the table has records.`,
      );
  }
}

export async function countTableRecords(tx: Connection, tableId: string): Promise<number> {
  const rows = await tx<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM automator_data_records WHERE table_id = ${tableId}`;
  return rows[0]?.count ?? 0;
}

/* Keep queries as tagged templates: Bun does not decode JSONB from parameterized unsafe queries. */
export function createDataTableStore(sql: SQL | undefined) {
  function connection() {
    if (!sql) throw new Error("Database is not configured");
    return sql;
  }
  return {
    async list(ownerId: string): Promise<DataTable[]> {
      const db = connection();
      const rows = await db<TableRow[]>`
        SELECT t.id, t.name, t.description, t.columns,
          (SELECT COUNT(*)::int FROM automator_data_records r WHERE r.table_id = t.id)
            AS "recordCount",
          t.created_at AS "createdAt", t.updated_at AS "updatedAt"
        FROM automator_data_tables t
        WHERE t.owner_id = ${ownerId}
        ORDER BY t.created_at DESC, t.id`;
      return rows.map(toTable);
    },
    async get(ownerId: string, id: string): Promise<DataTable | null> {
      const db = connection();
      const rows = await db<TableRow[]>`
        SELECT t.id, t.name, t.description, t.columns,
          (SELECT COUNT(*)::int FROM automator_data_records r WHERE r.table_id = t.id)
            AS "recordCount",
          t.created_at AS "createdAt", t.updated_at AS "updatedAt"
        FROM automator_data_tables t
        WHERE t.owner_id = ${ownerId} AND t.id = ${id}`;
      return rows[0] ? toTable(rows[0]) : null;
    },
    async create(ownerId: string, input: DataTableInput): Promise<DataTable> {
      assertColumns(input.columns);
      const db = connection();
      try {
        return await db.begin(async (tx) => {
          // The owner row serialises concurrent creates, so the cap cannot be raced past.
          const owner = await tx`SELECT id FROM automator_users WHERE id = ${ownerId} FOR UPDATE`;
          if (!owner.length)
            throw new DataTableOwnerMissingError("Data table owner does not exist");
          const counted = await tx<{ count: number }[]>`
            SELECT COUNT(*)::int AS count FROM automator_data_tables WHERE owner_id = ${ownerId}`;
          if ((counted[0]?.count ?? 0) >= dataTableLimit)
            throw new DataLimitError(`You can have at most ${dataTableLimit} tables.`);
          const rows = await tx<TableRow[]>`
            INSERT INTO automator_data_tables (id, owner_id, name, description, columns)
            VALUES (${crypto.randomUUID()}, ${ownerId}, ${input.name},
              ${input.description ?? null}, ${input.columns}::jsonb)
            RETURNING id, name, description, columns, 0 AS "recordCount",
              created_at AS "createdAt", updated_at AS "updatedAt"`;
          if (!rows[0]) throw new Error("Data table creation failed");
          return toTable(rows[0]);
        });
      } catch (error) {
        if (error instanceof Error && "errno" in error && error.errno === "23503")
          throw new DataTableOwnerMissingError("Data table owner does not exist");
        throw error;
      }
    },
    async update(ownerId: string, id: string, input: DataTableInput): Promise<DataTable | null> {
      assertColumns(input.columns);
      const db = connection();
      return db.begin(async (tx) => {
        const previous = await tx<{ columns: DataColumn[] }[]>`
          SELECT columns FROM automator_data_tables
          WHERE owner_id = ${ownerId} AND id = ${id} FOR UPDATE`;
        if (!previous[0]) return null;
        const recordCount = await countTableRecords(tx, id);
        // Removed columns keep their values inside each record's JSONB; there is no rewrite pass.
        if (recordCount > 0) {
          assertColumnTypesUnchanged(previous[0].columns, input.columns);
          await assertReintroducedColumnsMatchValues(tx, id, previous[0].columns, input.columns);
        }
        const rows = await tx<TableRow[]>`
          UPDATE automator_data_tables SET
            name = ${input.name}, description = ${input.description ?? null},
            columns = ${input.columns}::jsonb, updated_at = now()
          WHERE owner_id = ${ownerId} AND id = ${id}
          RETURNING id, name, description, columns, ${recordCount}::int AS "recordCount",
            created_at AS "createdAt", updated_at AS "updatedAt"`;
        return rows[0] ? toTable(rows[0]) : null;
      });
    },
    async remove(ownerId: string, id: string): Promise<boolean> {
      const db = connection();
      const rows = await db<{ id: string }[]>`
        DELETE FROM automator_data_tables
        WHERE owner_id = ${ownerId} AND id = ${id} RETURNING id`;
      return rows.length > 0;
    },
  };
}
export type DataTableStore = ReturnType<typeof createDataTableStore>;
