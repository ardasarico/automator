import { Value } from "@sinclair/typebox/value";
import { describe, expect, test } from "bun:test";
import { conditionOperators } from "./condition-operators";
import {
  createRecordConfigSchema,
  dataFilterRowSchema,
  dataNodeConfigSchemas,
  dataValueRowSchema,
  deleteRecordConfigSchema,
  findRecordsConfigSchema,
  updateRecordConfigSchema,
} from "./data-node-configs";
import { flowNodeConfigSchemas } from "./flow-node-configs";
import { parseNodeConfig } from "./node-config";

describe("data node config schemas", () => {
  test("mint a valid config from their defaults", () => {
    for (const schema of Object.values(dataNodeConfigSchemas)) {
      const created = Value.Create(schema);
      expect(Value.Check(schema, created)).toBe(true);
      expect(created).toEqual(parseNodeConfig(schema, {}));
    }
  });

  test("default to an unselected table and empty rows", () => {
    expect(Value.Create(createRecordConfigSchema)).toEqual({ tableId: "", values: [] });
    expect(Value.Create(findRecordsConfigSchema)).toEqual({
      tableId: "",
      filters: [],
      sortColumn: "",
      sortDirection: "desc",
      limit: 25,
    });
    expect(Value.Create(updateRecordConfigSchema)).toEqual({
      tableId: "",
      target: "record",
      recordId: "{{input.record.id}}",
      filters: [],
      values: [],
    });
    expect(Value.Create(deleteRecordConfigSchema)).toEqual({
      tableId: "",
      target: "record",
      recordId: "{{input.record.id}}",
      filters: [],
    });
  });

  test("mint filter and value rows the builder can append", () => {
    expect(Value.Create(dataFilterRowSchema)).toEqual({
      column: "",
      operator: "equals",
      value: "",
    });
    expect(Value.Create(dataValueRowSchema)).toEqual({ column: "", value: "" });
  });

  test("mark table and column fields for the schema-driven form", () => {
    expect(findRecordsConfigSchema.properties.tableId).toMatchObject({ tableRef: true });
    expect(findRecordsConfigSchema.properties.sortColumn).toMatchObject({ columnRef: true });
    expect(dataFilterRowSchema.properties.column).toMatchObject({ columnRef: true });
    expect(dataValueRowSchema.properties.column).toMatchObject({ columnRef: true });
  });

  test("offer exactly the shared condition operators", () => {
    const operators = dataFilterRowSchema.properties.operator.anyOf.map(
      (literal) => literal.const as string,
    );
    expect(operators).toEqual([...conditionOperators]);
    const row = { column: "c1", value: "a" };
    expect(Value.Check(dataFilterRowSchema, { ...row, operator: "contains" })).toBe(true);
    expect(Value.Check(dataFilterRowSchema, { ...row, operator: "matches" })).toBe(false);
  });

  test("bound the find limit to a page the UI can render", () => {
    expect(() => parseNodeConfig(findRecordsConfigSchema, { limit: 100 })).not.toThrow();
    expect(() => parseNodeConfig(findRecordsConfigSchema, { limit: 0 })).toThrow();
    expect(() => parseNodeConfig(findRecordsConfigSchema, { limit: 101 })).toThrow();
    expect(() => parseNodeConfig(findRecordsConfigSchema, { limit: 2.5 })).toThrow();
  });

  test("reject a target the executors cannot resolve", () => {
    expect(() => parseNodeConfig(updateRecordConfigSchema, { target: "filter" })).not.toThrow();
    expect(() => parseNodeConfig(deleteRecordConfigSchema, { target: "all" })).toThrow();
  });

  test("are registered under their node types", () => {
    expect(flowNodeConfigSchemas["data.create-record"]).toBe(createRecordConfigSchema);
    expect(flowNodeConfigSchemas["data.find-records"]).toBe(findRecordsConfigSchema);
    expect(flowNodeConfigSchemas["data.update-record"]).toBe(updateRecordConfigSchema);
    expect(flowNodeConfigSchemas["data.delete-record"]).toBe(deleteRecordConfigSchema);
  });
});
