import {
  createRecordConfigSchema,
  deleteRecordConfigSchema,
  findRecordsConfigSchema,
  isDataFilterOperatorAllowed,
  normalizeRecordValues,
  updateRecordConfigSchema,
  validateRecordValues,
  type DataColumn as SchemaColumn,
  type DataColumnType,
  type DataFilterRow,
  type DataValueRow,
} from "@automator/contracts";
import type {
  DataColumn,
  DataFilter,
  DataProvider,
  DataRecord,
  DataTable,
  DataTarget,
} from "./data";
import { NodeExecutionError, type ExecutionContext, type ExecutorRegistry } from "./executor";

function requireData(context: ExecutionContext): DataProvider {
  if (!context.data) throw new NodeExecutionError("No data store is configured for this run");
  return context.data;
}

/** Template resolution can turn any config string into another JSON value; every field reads as text. */
function text(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

async function requireTable(provider: DataProvider, tableId: unknown): Promise<DataTable> {
  const id = text(tableId).trim();
  if (!id) throw new NodeExecutionError("This node has no table selected");
  const table = await provider.table(id);
  if (!table) throw new NodeExecutionError(`Table "${id}" was not found`);
  return table;
}

function requireColumn(table: DataTable, columnId: unknown): DataColumn {
  const id = text(columnId).trim();
  const column = table.columns.find((candidate) => candidate.id === id);
  if (!column) throw new NodeExecutionError(`Table "${table.name}" has no "${id}" column`);
  return column;
}

function requireRecordId(value: unknown, what: string): string {
  const id = text(value).trim();
  if (!id) throw new NodeExecutionError(`${what} needs a record id`);
  return id;
}

/** A column in the shape the contract validators take. */
function schemaColumn(column: DataColumn): SchemaColumn {
  return {
    id: column.id,
    name: column.name,
    type: column.type as DataColumnType,
    required: column.required ?? false,
    ...(column.options ? { options: [...column.options] } : {}),
  };
}

/** The table's schema in the shape the contract validators take. */
function schemaColumns(table: DataTable): SchemaColumn[] {
  return table.columns.map(schemaColumn);
}

const trueWords = new Set(["true", "1"]);
const falseWords = new Set(["false", "0"]);

/** Config rows carry strings; a stored value has to have its column's own type. Blank stays blank. */
function coerce(column: DataColumn, raw: unknown): unknown {
  switch (column.type) {
    case "number": {
      if (typeof raw === "number") return raw;
      const value = text(raw).trim();
      if (!value) return "";
      const parsed = Number(value);
      if (!Number.isFinite(parsed))
        throw new NodeExecutionError(`"${column.name}" must be a number, not "${value}"`);
      return parsed;
    }
    case "checkbox": {
      if (typeof raw === "boolean") return raw;
      const value = text(raw).trim().toLowerCase();
      if (!value) return "";
      if (trueWords.has(value)) return true;
      if (falseWords.has(value)) return false;
      throw new NodeExecutionError(`"${column.name}" must be true or false, not "${value}"`);
    }
    default:
      return text(raw);
  }
}

function toValues(table: DataTable, rows: readonly DataValueRow[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const row of rows) {
    const column = requireColumn(table, row.column);
    values[column.id] = coerce(column, row.value);
  }
  return values;
}

/**
 * The stored form of one value: the store compares a filter against what the write path wrote, so a
 * filter value has to carry the same normalization (addresses lowercased, datetimes as UTC ISO).
 * A value the column would reject stays as coerced; the filter then simply matches nothing.
 */
function asStored(column: DataColumn, value: unknown): unknown {
  const columns = [schemaColumn(column)];
  const values = { [column.id]: value };
  if (validateRecordValues(columns, values).length > 0) return value;
  const normalized = normalizeRecordValues(columns, values);
  return column.id in normalized ? normalized[column.id] : value;
}

const valuelessOperators = new Set(["is_empty", "is_not_empty"]);

function toFilters(table: DataTable, rows: readonly DataFilterRow[]): DataFilter[] {
  return rows.map((row) => {
    const column = requireColumn(table, row.column);
    if (!isDataFilterOperatorAllowed(column.type, row.operator))
      throw new NodeExecutionError(`"${column.name}" cannot be filtered with "${row.operator}".`);
    // These two operators compare against nothing, so their value is carried through untouched.
    const value = valuelessOperators.has(row.operator)
      ? row.value
      : asStored(column, coerce(column, row.value));
    return { column: column.id, operator: row.operator, value };
  });
}

/** Validates the record as a whole, then cleans it for storage. */
function stored(table: DataTable, values: Record<string, unknown>): Record<string, unknown> {
  const columns = schemaColumns(table);
  const problems = validateRecordValues(columns, values);
  if (problems.length > 0)
    throw new NodeExecutionError(problems.map((problem) => problem.message).join(" "));
  return normalizeRecordValues(columns, values);
}

/* An update writes the whole record, so required columns it does not touch keep their stored value.
 * Values of columns dropped from the schema stay out; `normalizeRecordValues` would drop them anyway. */
function merged(
  table: DataTable,
  record: DataRecord,
  updates: Record<string, unknown>,
): Record<string, unknown> {
  const current: Record<string, unknown> = {};
  for (const column of table.columns)
    if (column.id in record.values) current[column.id] = record.values[column.id];
  const values = { ...current, ...updates };
  const columns = schemaColumns(table);
  /* A column this node never sets and the record never carried keeps whatever it is: a required
   * column added to the table after the record was written must not fail an unrelated update.
   * Only the "required" rule is relaxed, and only there; a blank value has no other problem. */
  const absent = new Set(
    columns
      .filter((column) => !(column.id in updates) && !(column.id in current))
      .map((column) => `values.${column.id}`),
  );
  const problems = validateRecordValues(columns, values).filter(
    (problem) => !absent.has(problem.path),
  );
  if (problems.length > 0)
    throw new NodeExecutionError(problems.map((problem) => problem.message).join(" "));
  return normalizeRecordValues(columns, values);
}

type TargetConfig = {
  target: "record" | "filter";
  recordId: string;
  filters: readonly DataFilterRow[];
};

async function resolveTarget(
  provider: DataProvider,
  table: DataTable,
  config: TargetConfig,
  what: string,
): Promise<DataRecord> {
  const target: DataTarget =
    config.target === "record"
      ? { recordId: requireRecordId(config.recordId, what) }
      : { query: { filters: toFilters(table, config.filters), limit: 1 } };
  const record = await provider.resolve(table.id, target);
  if (!record) throw new NodeExecutionError("No record matched");
  return record;
}

export const dataExecutors: ExecutorRegistry = {
  "data.create-record": {
    kind: "step",
    async run(context) {
      const provider = requireData(context);
      const config = context.config(createRecordConfigSchema);
      const table = await requireTable(provider, config.tableId);
      const values = stored(table, toValues(table, config.values));
      if (provider.mode === "dry-run") {
        const at = context.now().toISOString();
        return {
          record: {
            id: "simulated",
            tableId: table.id,
            values,
            createdAt: at,
            updatedAt: at,
            simulated: true,
          },
        };
      }
      return { record: await provider.create(table.id, values) };
    },
  },

  "data.find-records": {
    kind: "step",
    async run(context) {
      const provider = requireData(context);
      const config = context.config(findRecordsConfigSchema);
      const table = await requireTable(provider, config.tableId);
      const sortColumn = text(config.sortColumn).trim();
      // Reads are real in both modes; only writes are simulated.
      const records = await provider.find(table.id, {
        filters: toFilters(table, config.filters),
        ...(sortColumn
          ? {
              sort: {
                column: requireColumn(table, sortColumn).id,
                direction: config.sortDirection,
              },
            }
          : {}),
        limit: config.limit,
      });
      if (records.length === 0) return { empty: { records: [], count: 0, first: null } };
      return { found: { records, count: records.length, first: records[0] } };
    },
  },

  "data.update-record": {
    kind: "step",
    async run(context) {
      const provider = requireData(context);
      const config = context.config(updateRecordConfigSchema);
      const table = await requireTable(provider, config.tableId);
      const record = await resolveTarget(provider, table, config, "Update record");
      const values = merged(table, record, toValues(table, config.values));
      if (provider.mode === "dry-run") return { record: { ...record, values, simulated: true } };
      return { record: await provider.update(table.id, record.id, values) };
    },
  },

  "data.delete-record": {
    kind: "step",
    async run(context) {
      const provider = requireData(context);
      const config = context.config(deleteRecordConfigSchema);
      const table = await requireTable(provider, config.tableId);
      const record = await resolveTarget(provider, table, config, "Delete record");
      if (provider.mode === "dry-run") return { record: { ...record, simulated: true } };
      return { record: (await provider.remove(table.id, record.id)) ?? record };
    },
  },
};
