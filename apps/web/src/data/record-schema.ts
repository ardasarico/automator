import type { DataColumn } from "@automator/contracts";
import type { Property } from "../components/schema-form/schema";

/** The value object the schema form edits: one entry per column, keyed by column id. */
export type RecordFormValues = Record<string, unknown>;

const datetimeHint = "Entered in your timezone and stored in UTC.";
const addressHint = "Wallet address in the 0x… format, 42 characters long.";

function describe(column: DataColumn, hint?: string): string | undefined {
  const parts = [column.required ? "Required." : undefined, hint].filter(
    (part): part is string => part !== undefined,
  );
  return parts.length > 0 ? parts.join(" ") : undefined;
}

/** The form property one column renders as. `select` keeps `type` as the fallback for no options. */
export function columnToProperty(column: DataColumn): Property {
  switch (column.type) {
    case "number":
      return { type: "number", description: describe(column) };
    case "checkbox":
      return { type: "boolean", description: describe(column) };
    case "datetime":
      return { type: "string", format: "date-time", description: describe(column, datetimeHint) };
    case "select":
      return {
        type: "string",
        anyOf: (column.options ?? []).map((option) => ({ const: option })),
        description: describe(column),
      };
    case "address":
      return { type: "string", description: describe(column, addressHint) };
    case "text":
      return { type: "string", description: describe(column) };
  }
}

/** The property map the record dialog renders, keyed by column id. */
export function columnsToSchema(columns: readonly DataColumn[]): Record<string, Property> {
  const schema: Record<string, Property> = {};
  for (const column of columns) schema[column.id] = columnToProperty(column);
  return schema;
}

/**
 * A record's stored values as the form edits them. A missing value becomes the empty control state,
 * and a select falls back to its first option because the Select always displays one — showing an
 * option the save would drop would be worse than starting on it.
 */
export function recordToFormValues(
  columns: readonly DataColumn[],
  values: Record<string, unknown> = {},
): RecordFormValues {
  const form: RecordFormValues = {};
  for (const column of columns) {
    const value = values[column.id];
    switch (column.type) {
      case "checkbox":
        form[column.id] = value === true;
        break;
      case "number":
        form[column.id] = typeof value === "number" && Number.isFinite(value) ? value : "";
        break;
      case "select": {
        const options = column.options ?? [];
        form[column.id] =
          typeof value === "string" && options.includes(value) ? value : (options[0] ?? "");
        break;
      }
      default:
        form[column.id] = typeof value === "string" ? value : "";
    }
  }
  return form;
}

/**
 * The form's values as a record body. Blanks are dropped so a required column reports itself as
 * missing rather than as the wrong type. A number field that overflows reports `Infinity`, which is
 * kept as the text it stands for: `JSON.stringify` writes it as `null`, a blank the API would read
 * as no value, while the text has `validateRecordValues` name the column here and there alike.
 */
export function formValuesToRecord(
  columns: readonly DataColumn[],
  form: RecordFormValues,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const column of columns) {
    const value = form[column.id];
    if (column.type === "checkbox") {
      values[column.id] = value === true;
      continue;
    }
    if (column.type === "number") {
      if (typeof value === "number") {
        values[column.id] = Number.isFinite(value) ? value : String(value);
      } else if (typeof value === "string" && value.trim() !== "") {
        const text = value.trim();
        const parsed = Number(text);
        values[column.id] = Number.isFinite(parsed) ? parsed : text;
      }
      continue;
    }
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (text !== "") values[column.id] = text;
  }
  return values;
}

const maxIdLength = 64;

/**
 * A stable column id derived from the column's name, unique among `taken`. The id is minted once
 * when the column is added; renaming the column later never changes it, so stored values keep
 * resolving.
 */
export function columnIdFrom(name: string, taken: Iterable<string> = []): string {
  // Only [a-z0-9_] survives, with no leading or trailing underscore, which is the id the contract
  // accepts; a name with nothing to slugify falls back to a generic root.
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxIdLength);
  const root = slug === "" ? "column" : slug;
  const used = new Set(taken);
  if (!used.has(root)) return root;
  for (let suffix = 2; ; suffix += 1) {
    const tail = `_${suffix}`;
    const candidate = `${root.slice(0, maxIdLength - tail.length)}${tail}`;
    if (!used.has(candidate)) return candidate;
  }
}
