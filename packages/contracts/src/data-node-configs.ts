import { Type, type Static } from "@sinclair/typebox";
import { conditionOperators } from "./condition-operators";

/*
 * `tableRef` and `columnRef` are UI hints, read by the builder's schema-driven form to render a
 * table or column picker instead of a text input, the way `secret` marks a redacted field.
 */
const tableIdField = () =>
  Type.String({ default: "", tableRef: true, description: "The table this node works on." });

const columnField = (description?: string) =>
  Type.String({ default: "", columnRef: true, ...(description ? { description } : {}) });

export const dataFilterRowSchema = Type.Object({
  column: columnField(),
  /* operatorFor names the sibling field holding the column, so the editor can offer
   * only the operators that column's type supports. */
  operator: Type.Union(
    conditionOperators.map((operator) => Type.Literal(operator)),
    { default: "equals", operatorFor: "column" },
  ),
  value: Type.String({ default: "" }),
});
export type DataFilterRow = Static<typeof dataFilterRowSchema>;

export const dataValueRowSchema = Type.Object({
  column: columnField(),
  value: Type.String({ default: "" }),
});
export type DataValueRow = Static<typeof dataValueRowSchema>;

const filtersField = (description: string) =>
  Type.Array(dataFilterRowSchema, { default: [], description });

const valuesField = () =>
  Type.Array(dataValueRowSchema, { default: [], description: "The columns to write." });

const targetField = () =>
  Type.Union([Type.Literal("record"), Type.Literal("filter")], {
    default: "record",
    description: "Whether the record is named by id or found by a filter.",
  });

export const createRecordConfigSchema = Type.Object({
  tableId: tableIdField(),
  values: valuesField(),
});
export type CreateRecordConfig = Static<typeof createRecordConfigSchema>;

export const findRecordsConfigSchema = Type.Object({
  tableId: tableIdField(),
  filters: filtersField("Every filter has to match for a record to be returned."),
  sortColumn: columnField("Blank sorts by creation time."),
  sortDirection: Type.Union([Type.Literal("asc"), Type.Literal("desc")], { default: "desc" }),
  limit: Type.Integer({ default: 25, minimum: 1, maximum: 100 }),
});
export type FindRecordsConfig = Static<typeof findRecordsConfigSchema>;

export const updateRecordConfigSchema = Type.Object({
  tableId: tableIdField(),
  target: targetField(),
  recordId: Type.String({ default: "{{input.record.id}}" }),
  filters: filtersField("Used when the target is a filter; the first match is updated."),
  values: valuesField(),
});
export type UpdateRecordConfig = Static<typeof updateRecordConfigSchema>;

export const deleteRecordConfigSchema = Type.Object({
  tableId: tableIdField(),
  target: targetField(),
  recordId: Type.String({ default: "{{input.record.id}}" }),
  filters: filtersField("Used when the target is a filter; the first match is deleted."),
});
export type DeleteRecordConfig = Static<typeof deleteRecordConfigSchema>;

export const dataNodeConfigSchemas = {
  "data.create-record": createRecordConfigSchema,
  "data.find-records": findRecordsConfigSchema,
  "data.update-record": updateRecordConfigSchema,
  "data.delete-record": deleteRecordConfigSchema,
} as const;
