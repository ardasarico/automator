import { Value } from "@sinclair/typebox/value";
import { describe, expect, test } from "bun:test";
import { conditionOperators } from "./condition-operators";
import {
  clearDataTableReferences,
  createDataRecordContract,
  createDataTableContract,
  dataColumnOperators,
  isDataFilterOperatorAllowed,
  dataColumnSchema,
  dataColumnTypes,
  dataRecordSchema,
  dataTableSchema,
  deleteDataTableContract,
  isDataRecordInput,
  isDataTableInput,
  listDataRecordsContract,
  listDataTablesContract,
  normalizeRecordValues,
  parseDataRecordListLimit,
  updateDataTableContract,
  validateRecordValues,
  type DataColumn,
} from "./data-tables";

const columns: DataColumn[] = [
  { id: "title", name: "Title", type: "text", required: true },
  { id: "amount", name: "Amount", type: "number", required: false },
  { id: "paid", name: "Paid", type: "checkbox", required: false },
  { id: "due", name: "Due", type: "datetime", required: false },
  {
    id: "status",
    name: "Status",
    type: "select",
    required: false,
    options: ["open", "closed"],
  },
  { id: "wallet", name: "Wallet", type: "address", required: false },
];

const address = "0xAbC0000000000000000000000000000000000123";

describe("data column schema", () => {
  test.each([...dataColumnTypes])("accepts a %s column", (type) => {
    const column = {
      id: "c1",
      name: "Column",
      type,
      required: false,
      options: ["open"],
    };
    expect(Value.Check(dataColumnSchema, column)).toBe(true);
  });

  test.each([
    ["an unknown type", { id: "c1", name: "Column", type: "json", required: false }],
    ["an empty id", { id: "", name: "Column", type: "text", required: false }],
    ["an uppercase id", { id: "Title", name: "Column", type: "text", required: false }],
    ["an id starting with a dash", { id: "-title", name: "Column", type: "text", required: false }],
    ["an empty name", { id: "c1", name: "", type: "text", required: false }],
    ["an overlong name", { id: "c1", name: "a".repeat(65), type: "text", required: false }],
    ["a missing type", { id: "c1", name: "Column", required: false }],
    ["non-string options", { id: "c1", name: "Column", type: "select", options: [1] }],
  ])("rejects %s", (_name, invalid) => {
    expect(Value.Check(dataColumnSchema, invalid)).toBe(false);
  });

  test("required defaults to false", () => {
    const column = Value.Default(dataColumnSchema, {
      id: "c1",
      name: "Column",
      type: "text",
    });
    expect(column).toMatchObject({ required: false });
  });
});

describe("data table and record schemas", () => {
  const table = {
    id: "tbl-1",
    name: "Invoices",
    description: "Outstanding invoices.",
    columns,
    recordCount: 2,
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
  };

  test("accepts a representative table and record", () => {
    expect(Value.Check(dataTableSchema, table)).toBe(true);
    expect(Value.Check(dataTableSchema, { ...table, description: undefined })).toBe(true);
    expect(
      Value.Check(dataRecordSchema, {
        id: "rec-1",
        tableId: "tbl-1",
        values: { title: "Rent", amount: 12 },
        createdAt: "2026-09-08T00:00:00.000Z",
        updatedAt: "2026-09-08T00:00:00.000Z",
      }),
    ).toBe(true);
  });

  test("rejects a table without a record count", () => {
    const { recordCount: _count, ...withoutCount } = table;
    expect(Value.Check(dataTableSchema, withoutCount)).toBe(false);
  });

  test("table input accepts a name, description and columns only", () => {
    expect(isDataTableInput({ name: "Invoices", columns })).toBe(true);
    expect(isDataTableInput({ name: "Invoices", description: "Notes.", columns })).toBe(true);
  });

  test.each([
    ["a blank name", { name: "   ", columns }],
    ["an overlong name", { name: "a".repeat(65), columns }],
    ["missing columns", { name: "Invoices" }],
    ["an unknown key", { name: "Invoices", columns, id: "tbl-1" }],
    ["too many columns", { name: "Invoices", columns: Array(51).fill(columns[0]) }],
    ["an invalid column", { name: "Invoices", columns: [{ id: "a", name: "A", type: "json" }] }],
  ])("table input rejects %s", (_name, invalid) => {
    expect(isDataTableInput(invalid)).toBe(false);
  });

  test("record input carries values only", () => {
    expect(isDataRecordInput({ values: { title: "Rent" } })).toBe(true);
    expect(isDataRecordInput({ values: {}, tableId: "tbl-1" })).toBe(false);
    expect(isDataRecordInput({})).toBe(false);
  });
});

describe("column operators", () => {
  test("every column type has operators drawn from the condition operators", () => {
    expect(Object.keys(dataColumnOperators).sort()).toEqual([...dataColumnTypes].sort());
    for (const type of dataColumnTypes) {
      const allowed = dataColumnOperators[type];
      expect(allowed.length).toBeGreaterThan(0);
      expect(new Set(allowed).size).toBe(allowed.length);
      for (const operator of allowed) expect(conditionOperators).toContain(operator);
    }
  });

  test("only text compares by containment and only ordered types compare by size", () => {
    expect(dataColumnOperators.text).toContain("contains");
    expect(dataColumnOperators.number).not.toContain("contains");
    expect(dataColumnOperators.number).toContain("greater_than");
    expect(dataColumnOperators.checkbox).toEqual([
      "equals",
      "not_equals",
      "is_empty",
      "is_not_empty",
    ]);
    expect(dataColumnOperators.select).not.toContain("greater_than");
  });

  test("a filter operator is allowed only where its column type supports it", () => {
    expect(isDataFilterOperatorAllowed("text", "contains")).toBe(true);
    expect(isDataFilterOperatorAllowed("checkbox", "contains")).toBe(false);
    expect(isDataFilterOperatorAllowed("checkbox", "is_empty")).toBe(true);
    expect(isDataFilterOperatorAllowed("select", "greater_than")).toBe(false);
    expect(isDataFilterOperatorAllowed("datetime", "less_than")).toBe(true);
    expect(isDataFilterOperatorAllowed("retired-type", "equals")).toBe(false);
  });
});

describe("validateRecordValues", () => {
  test("accepts a complete record", () => {
    expect(
      validateRecordValues(columns, {
        title: "Rent",
        amount: 1200.5,
        paid: false,
        due: "2026-09-08T10:00:00.000Z",
        status: "open",
        wallet: address,
      }),
    ).toEqual([]);
  });

  test("accepts a record with only the required column", () => {
    expect(validateRecordValues(columns, { title: "Rent" })).toEqual([]);
  });

  test("treats blank optional values as absent", () => {
    expect(
      validateRecordValues(columns, {
        title: "Rent",
        amount: null,
        status: "",
      }),
    ).toEqual([]);
  });

  test.each([
    ["a value for an unknown column", { title: "Rent", nope: 1 }, "values.nope"],
    ["a missing required column", { amount: 1 }, "values.title"],
    ["an empty required column", { title: "" }, "values.title"],
    ["a null required column", { title: null }, "values.title"],
    ["a non-string text value", { title: 5 }, "values.title"],
    ["an overlong text value", { title: "a".repeat(10001) }, "values.title"],
    ["a numeric string", { title: "Rent", amount: "12" }, "values.amount"],
    ["a non-finite number", { title: "Rent", amount: Number.POSITIVE_INFINITY }, "values.amount"],
    ["a NaN number", { title: "Rent", amount: Number.NaN }, "values.amount"],
    ["a non-boolean checkbox", { title: "Rent", paid: "yes" }, "values.paid"],
    ["an unparsable datetime", { title: "Rent", due: "not a date" }, "values.due"],
    ["a non-string datetime", { title: "Rent", due: 1757289600000 }, "values.due"],
    ["a select value off the options", { title: "Rent", status: "archived" }, "values.status"],
    ["a malformed address", { title: "Rent", wallet: "0x123" }, "values.wallet"],
  ])("reports %s", (_name, values, path) => {
    expect(validateRecordValues(columns, values)).toEqual([
      { path, message: expect.any(String) as unknown as string },
    ]);
  });

  test("accepts false and zero for optional columns", () => {
    expect(validateRecordValues(columns, { title: "Rent", paid: false, amount: 0 })).toEqual([]);
  });

  test("rejects every select value when the column has no options", () => {
    const select: DataColumn[] = [
      { id: "status", name: "Status", type: "select", required: false },
    ];
    expect(validateRecordValues(select, { status: "open" })).toHaveLength(1);
  });
});

describe("normalizeRecordValues", () => {
  test("lowercases an address and normalizes a datetime to UTC ISO", () => {
    expect(
      normalizeRecordValues(columns, {
        title: "Rent",
        wallet: address,
        due: "2026-09-08T12:00:00+02:00",
      }),
    ).toEqual({
      title: "Rent",
      wallet: address.toLowerCase(),
      due: "2026-09-08T10:00:00.000Z",
    });
  });

  test("drops blank optional values and values for unknown columns", () => {
    expect(
      normalizeRecordValues(columns, {
        title: "Rent",
        amount: null,
        status: "",
        nope: 1,
      }),
    ).toEqual({ title: "Rent" });
  });

  test("keeps false and zero", () => {
    expect(normalizeRecordValues(columns, { title: "Rent", paid: false, amount: 0 })).toEqual({
      title: "Rent",
      paid: false,
      amount: 0,
    });
  });
});

describe("clearDataTableReferences", () => {
  const document = {
    version: 1,
    id: "flow-1",
    name: "Invoices",
    description: "",
    nodes: [
      {
        id: "n1",
        type: "data.find-records",
        position: { x: 0, y: 0 },
        label: "Find records",
        config: {
          tableId: "tbl-1",
          filters: [{ column: "title", operator: "equals", value: "Rent" }],
          sortColumn: "due",
          sortDirection: "asc",
          limit: 25,
        },
      },
      {
        id: "n2",
        type: "logic.condition",
        position: { x: 300, y: 0 },
        label: "Check",
        config: { operator: "equals", value: "Rent" },
      },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2" }],
  };

  test("blanks a data node and leaves other nodes untouched", () => {
    const cleared = clearDataTableReferences(document);
    expect(cleared.nodes[0]!.config).toEqual({
      tableId: "",
      filters: [],
      sortColumn: "",
      sortDirection: "asc",
      limit: 25,
    });
    expect(cleared.nodes[1]).toEqual(document.nodes[1]!);
    expect(cleared.edges).toEqual(document.edges);
  });

  test("does not mutate the source document", () => {
    clearDataTableReferences(document);
    expect(document.nodes[0]!.config.tableId).toBe("tbl-1");
  });

  test("empties value rows and adds a blank table id when the config has none", () => {
    const nodes: {
      id: string;
      type: string;
      config?: Record<string, unknown>;
    }[] = [
      {
        id: "n1",
        type: "data.create-record",
        config: { values: [{ column: "title" }] },
      },
      { id: "n2", type: "data.delete-record" },
    ];
    const cleared = clearDataTableReferences({ nodes });
    expect(cleared.nodes[0]!.config).toEqual({ tableId: "", values: [] });
    expect(cleared.nodes[1]).toEqual({
      id: "n2",
      type: "data.delete-record",
      config: { tableId: "" },
    });
  });

  test("passes unknown shapes through untouched", () => {
    expect(clearDataTableReferences(null)).toBeNull();
    expect(clearDataTableReferences({ nodes: "nope" })).toEqual({
      nodes: "nope",
    });
    expect(clearDataTableReferences({ nodes: [42] })).toEqual({ nodes: [42] });
  });
});

describe("data endpoint contracts", () => {
  test("paths and methods", () => {
    expect([
      listDataTablesContract,
      createDataTableContract,
      updateDataTableContract,
      deleteDataTableContract,
      listDataRecordsContract,
      createDataRecordContract,
    ]).toEqual([
      expect.objectContaining({ method: "GET", path: "/data/tables" }),
      expect.objectContaining({ method: "POST", path: "/data/tables" }),
      expect.objectContaining({ method: "PATCH", path: "/data/tables/:id" }),
      expect.objectContaining({ method: "DELETE", path: "/data/tables/:id" }),
      expect.objectContaining({
        method: "GET",
        path: "/data/tables/:id/records",
      }),
      expect.objectContaining({
        method: "POST",
        path: "/data/tables/:id/records",
      }),
    ]);
  });

  test("the delete response carries the flows that reference the table", () => {
    const response = deleteDataTableContract.response[200];
    expect(
      Value.Check(response, {
        deleted: false,
        usedBy: [{ id: "flow-1", name: "Rent" }],
      }),
    ).toBe(true);
    expect(Value.Check(response, { deleted: true, usedBy: [] })).toBe(true);
    expect(Value.Check(response, { deleted: true })).toBe(false);
  });

  test("the record list response pages with an optional cursor", () => {
    const response = listDataRecordsContract.response[200];
    expect(Value.Check(response, { records: [] })).toBe(true);
    expect(Value.Check(response, { records: [], nextCursor: "abc" })).toBe(true);
    expect(Value.Check(response, { records: [], nextCursor: "" })).toBe(false);
  });

  test("the record list limit parses like the run list limit", () => {
    expect(parseDataRecordListLimit(undefined)).toBeUndefined();
    expect(parseDataRecordListLimit("10")).toBe(10);
    expect(parseDataRecordListLimit("0")).toBeNull();
    expect(parseDataRecordListLimit("101")).toBeNull();
    expect(parseDataRecordListLimit("ten")).toBeNull();
  });
});
