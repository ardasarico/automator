import { Type, type Static } from "@sinclair/typebox";
import { Check } from "@sinclair/typebox/value";
import type { ConditionOperator } from "./condition-operators";
import { apiErrorResponses } from "./contract";

export const dataColumnTypes = [
  "text",
  "number",
  "checkbox",
  "datetime",
  "select",
  "address",
] as const;
export type DataColumnType = (typeof dataColumnTypes)[number];

/* Unsafe preserves the literal union that mapping to Type.Union would widen. */
export const dataColumnTypeSchema = Type.Unsafe<DataColumnType>(
  Type.Union(dataColumnTypes.map((type) => Type.Literal(type))),
);

export const dataTableMaxColumns = 50;
export const dataTextMaxLength = 10000;
export const addressPattern = /^0x[0-9a-fA-F]{40}$/;

export const dataColumnSchema = Type.Object({
  id: Type.String({ minLength: 1, pattern: "^[a-z0-9][a-z0-9_-]{0,63}$" }),
  name: Type.String({ minLength: 1, maxLength: 64 }),
  type: dataColumnTypeSchema,
  required: Type.Boolean({ default: false }),
  /** Only meaningful for `select`; every other column type ignores it. */
  options: Type.Optional(
    Type.Array(Type.String({ minLength: 1, maxLength: 64 }), { maxItems: 50 }),
  ),
});
export type DataColumn = Static<typeof dataColumnSchema>;

export const dataTableSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  name: Type.String({ minLength: 1, maxLength: 64 }),
  description: Type.Optional(Type.String({ maxLength: 280 })),
  columns: Type.Array(dataColumnSchema, { maxItems: dataTableMaxColumns }),
  recordCount: Type.Integer({ minimum: 0 }),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});
export type DataTable = Static<typeof dataTableSchema>;

export const dataTableInputSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 64, pattern: "\\S" }),
    description: Type.Optional(Type.String({ maxLength: 280 })),
    columns: Type.Array(dataColumnSchema, { maxItems: dataTableMaxColumns }),
  },
  { additionalProperties: false },
);
export type DataTableInput = Static<typeof dataTableInputSchema>;

export function isDataTableInput(body: unknown): body is DataTableInput {
  return Check(dataTableInputSchema, body);
}

export const dataRecordSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  tableId: Type.String({ minLength: 1 }),
  values: Type.Record(Type.String(), Type.Unknown()),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});
export type DataRecord = Static<typeof dataRecordSchema>;

export const dataRecordInputSchema = Type.Object(
  { values: Type.Record(Type.String(), Type.Unknown()) },
  { additionalProperties: false },
);
export type DataRecordInput = Static<typeof dataRecordInputSchema>;

export function isDataRecordInput(body: unknown): body is DataRecordInput {
  return Check(dataRecordInputSchema, body);
}

/** The filter operators each column type supports, shared by the node config UI and the API. */
export const dataColumnOperators: Record<DataColumnType, readonly ConditionOperator[]> = {
  text: ["equals", "not_equals", "contains", "is_empty", "is_not_empty"],
  number: ["equals", "not_equals", "greater_than", "less_than", "is_empty", "is_not_empty"],
  datetime: ["equals", "not_equals", "greater_than", "less_than", "is_empty", "is_not_empty"],
  checkbox: ["equals", "not_equals", "is_empty", "is_not_empty"],
  select: ["equals", "not_equals", "is_empty", "is_not_empty"],
  address: ["equals", "not_equals", "is_empty", "is_not_empty"],
};

/** A filter may only use an operator its column type supports. */
export function isDataFilterOperatorAllowed(type: string, operator: ConditionOperator): boolean {
  return dataColumnOperators[type as DataColumnType]?.includes(operator) ?? false;
}

export interface DataValueProblem {
  path: string;
  message: string;
}

/** `undefined`, `null` and the empty string all mean "no value" for every column type. */
function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function checkValue(column: DataColumn, value: unknown): string | null {
  switch (column.type) {
    case "text":
      if (typeof value !== "string") return `"${column.name}" must be text.`;
      return value.length > dataTextMaxLength
        ? `"${column.name}" must be at most ${dataTextMaxLength} characters.`
        : null;
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? null
        : `"${column.name}" must be a number.`;
    case "checkbox":
      return typeof value === "boolean" ? null : `"${column.name}" must be true or false.`;
    case "datetime":
      return typeof value === "string" && !Number.isNaN(Date.parse(value))
        ? null
        : `"${column.name}" must be a date and time.`;
    case "select":
      return typeof value === "string" && (column.options ?? []).includes(value)
        ? null
        : `"${column.name}" must be one of its options.`;
    case "address":
      return typeof value === "string" && addressPattern.test(value)
        ? null
        : `"${column.name}" must be a wallet address.`;
  }
}

/** Returns the problems with `values` against `columns`; an empty array means the record is valid. */
export function validateRecordValues(
  columns: readonly DataColumn[],
  values: Record<string, unknown>,
): DataValueProblem[] {
  const problems: DataValueProblem[] = [];
  const known = new Set(columns.map((column) => column.id));
  for (const key of Object.keys(values))
    if (!known.has(key))
      problems.push({
        path: `values.${key}`,
        message: `This table has no "${key}" column.`,
      });
  for (const column of columns) {
    const path = `values.${column.id}`;
    const value = values[column.id];
    if (isBlank(value)) {
      if (column.required) problems.push({ path, message: `"${column.name}" is required.` });
      continue;
    }
    const message = checkValue(column, value);
    if (message) problems.push({ path, message });
  }
  return problems;
}

/** Cleans validated values for storage: addresses lowercased, datetimes as UTC ISO, blanks dropped. */
export function normalizeRecordValues(
  columns: readonly DataColumn[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const column of columns) {
    const value = values[column.id];
    if (isBlank(value)) continue;
    if (column.type === "address" && typeof value === "string")
      normalized[column.id] = value.toLowerCase();
    else if (column.type === "datetime" && typeof value === "string")
      normalized[column.id] = new Date(value).toISOString();
    else normalized[column.id] = value;
  }
  return normalized;
}

const clearedConfigKeys = ["filters", "values", "sortColumn"] as const;

function emptied(value: unknown): unknown {
  if (Array.isArray(value)) return [];
  if (typeof value === "string") return "";
  if (value !== null && typeof value === "object") return {};
  return value;
}

/**
 * Blanks every table reference on the document's `data.*` nodes so a forked flow never points at
 * the publisher's tables. Shapes it does not recognise pass through untouched.
 */
export function clearDataTableReferences<T>(document: T): T {
  const source = document as { nodes?: unknown } | null;
  if (source === null || typeof source !== "object" || !Array.isArray(source.nodes))
    return document;
  const nodes = source.nodes.map((node: unknown) => {
    const candidate = node as { type?: unknown; config?: unknown } | null;
    if (candidate === null || typeof candidate !== "object") return node;
    if (typeof candidate.type !== "string" || !candidate.type.startsWith("data.")) return node;
    const config =
      candidate.config !== null && typeof candidate.config === "object"
        ? { ...(candidate.config as Record<string, unknown>) }
        : {};
    config.tableId = "";
    for (const key of clearedConfigKeys) if (key in config) config[key] = emptied(config[key]);
    return { ...candidate, config };
  });
  return { ...source, nodes } as T;
}

const tableParamsSchema = Type.Object({ id: Type.String({ minLength: 1 }) });
const recordParamsSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  recordId: Type.String({ minLength: 1 }),
});

export const dataTableUsageSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  name: Type.String(),
});
export type DataTableUsage = Static<typeof dataTableUsageSchema>;

export const listDataTablesContract = {
  method: "GET",
  path: "/data/tables",
  response: {
    200: Type.Object({ tables: Type.Array(dataTableSchema) }),
    ...apiErrorResponses,
  },
} as const;
export const createDataTableContract = {
  method: "POST",
  path: "/data/tables",
  body: dataTableInputSchema,
  response: { 201: dataTableSchema, ...apiErrorResponses },
} as const;
export const getDataTableContract = {
  method: "GET",
  path: "/data/tables/:id",
  params: tableParamsSchema,
  response: { 200: dataTableSchema, ...apiErrorResponses },
} as const;
export const updateDataTableContract = {
  method: "PATCH",
  path: "/data/tables/:id",
  params: tableParamsSchema,
  body: dataTableInputSchema,
  response: { 200: dataTableSchema, ...apiErrorResponses },
} as const;
/** `deleted` is false when the table is still in use and the caller has to confirm. */
export const deleteDataTableContract = {
  method: "DELETE",
  path: "/data/tables/:id",
  params: tableParamsSchema,
  query: Type.Object({ confirm: Type.Optional(Type.String({ minLength: 1 })) }),
  response: {
    200: Type.Object({
      deleted: Type.Boolean(),
      usedBy: Type.Array(dataTableUsageSchema),
    }),
    ...apiErrorResponses,
  },
} as const;

export const dataRecordListDefaultLimit = 25;
export const dataRecordListMaxLimit = 100;

export function parseDataRecordListLimit(value: string | undefined): number | undefined | null {
  if (value === undefined) return undefined;
  if (!/^[0-9]+$/.test(value)) return null;
  const limit = Number(value);
  return limit >= 1 && limit <= dataRecordListMaxLimit ? limit : null;
}

export const dataRecordListQuerySchema = Type.Object({
  cursor: Type.Optional(Type.String({ minLength: 1 })),
  limit: Type.Optional(Type.String({ minLength: 1 })),
});
export type DataRecordListQuery = Static<typeof dataRecordListQuerySchema>;

export const dataRecordListSchema = Type.Object({
  records: Type.Array(dataRecordSchema),
  nextCursor: Type.Optional(Type.String({ minLength: 1 })),
});
export type DataRecordList = Static<typeof dataRecordListSchema>;

export const listDataRecordsContract = {
  method: "GET",
  path: "/data/tables/:id/records",
  params: tableParamsSchema,
  query: dataRecordListQuerySchema,
  response: { 200: dataRecordListSchema, ...apiErrorResponses },
} as const;
export const createDataRecordContract = {
  method: "POST",
  path: "/data/tables/:id/records",
  params: tableParamsSchema,
  body: dataRecordInputSchema,
  response: { 201: dataRecordSchema, ...apiErrorResponses },
} as const;
export const updateDataRecordContract = {
  method: "PATCH",
  path: "/data/tables/:id/records/:recordId",
  params: recordParamsSchema,
  body: dataRecordInputSchema,
  response: { 200: dataRecordSchema, ...apiErrorResponses },
} as const;
export const deleteDataRecordContract = {
  method: "DELETE",
  path: "/data/tables/:id/records/:recordId",
  params: recordParamsSchema,
  response: {
    200: Type.Object({ id: Type.String({ minLength: 1 }) }),
    ...apiErrorResponses,
  },
} as const;

export type ListDataTablesResponse = Static<(typeof listDataTablesContract.response)[200]>;
export type DeleteDataTableResponse = Static<(typeof deleteDataTableContract.response)[200]>;
