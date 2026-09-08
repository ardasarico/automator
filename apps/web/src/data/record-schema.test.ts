/// <reference types="bun" />
import { validateRecordValues, type DataColumn } from "@automator/contracts";
import { expect, test } from "bun:test";
import {
  columnIdFrom,
  columnsToSchema,
  columnToProperty,
  formValuesToRecord,
  recordToFormValues,
} from "./record-schema";

const column = (over: Partial<DataColumn> & Pick<DataColumn, "id" | "type">): DataColumn => ({
  name: over.id,
  required: false,
  ...over,
});

const columns: DataColumn[] = [
  column({ id: "note", type: "text" }),
  column({ id: "amount", type: "number" }),
  column({ id: "paid", type: "checkbox" }),
  column({ id: "due", type: "datetime" }),
  column({ id: "tier", type: "select", options: ["gold", "silver"] }),
  column({ id: "wallet", type: "address" }),
];

test("each column type maps to the control the schema form renders", () => {
  const schema = columnsToSchema(columns);
  expect(schema.note).toEqual({ type: "string", description: undefined });
  expect(schema.amount).toEqual({ type: "number", description: undefined });
  expect(schema.paid).toEqual({ type: "boolean", description: undefined });
  expect(schema.due).toEqual({
    type: "string",
    format: "date-time",
    description: "Entered in your timezone and stored in UTC.",
  });
  expect(schema.tier!.anyOf).toEqual([{ const: "gold" }, { const: "silver" }]);
  expect(schema.wallet!.description).toContain("0x");
});

test("a required column says so in its description", () => {
  const property = columnToProperty(column({ id: "wallet", type: "address", required: true }));
  expect(property.description).toBe(
    "Required. Wallet address in the 0x… format, 42 characters long.",
  );
});

test("a select with no options still renders as a text field", () => {
  const property = columnToProperty(column({ id: "tier", type: "select" }));
  expect(property.anyOf).toEqual([]);
  expect(property.type).toBe("string");
});

test("stored values become the control state each field expects", () => {
  const form = recordToFormValues(columns, {
    note: "hello",
    amount: 12,
    paid: true,
    due: "2026-09-08T10:00:00.000Z",
    tier: "silver",
    wallet: "0x" + "ab".repeat(20),
  });
  expect(form).toEqual({
    note: "hello",
    amount: 12,
    paid: true,
    due: "2026-09-08T10:00:00.000Z",
    tier: "silver",
    wallet: "0x" + "ab".repeat(20),
  });
});

test("a new record starts blank, unchecked and on the first select option", () => {
  expect(recordToFormValues(columns)).toEqual({
    note: "",
    amount: "",
    paid: false,
    due: "",
    tier: "gold",
    wallet: "",
  });
});

test("a stored select value the column no longer offers falls back to the first option", () => {
  expect(recordToFormValues([columns[4]!], { tier: "bronze" })).toEqual({ tier: "gold" });
});

test("blanks are dropped so a required column reports as missing, not as the wrong type", () => {
  expect(formValuesToRecord(columns, recordToFormValues(columns))).toEqual({
    paid: false,
    tier: "gold",
  });
});

test("text is trimmed and typed numbers survive as numbers", () => {
  const values = formValuesToRecord(columns, {
    note: "  hello  ",
    amount: 4.5,
    paid: false,
    due: " 2026-09-08T10:00:00Z ",
    tier: "silver",
    wallet: " 0xABC ",
  });
  expect(values).toEqual({
    note: "hello",
    amount: 4.5,
    paid: false,
    due: "2026-09-08T10:00:00Z",
    tier: "silver",
    wallet: "0xABC",
  });
});

test.each([
  ["an entry that overflows the field", Infinity, "Infinity"],
  ["text no field would report", "twelve", "twelve"],
])("a number that is not one is kept as text and named as a problem: %s", (_case, typed, sent) => {
  const amount = columns[1]!;
  const values = formValuesToRecord([amount], { amount: typed });
  expect(values).toEqual({ amount: sent });
  // `JSON.stringify` writes `NaN` and `Infinity` as `null`; the text reaches the API as it is.
  expect(JSON.parse(JSON.stringify(values))).toEqual({ amount: sent });
  expect(validateRecordValues([amount], values)).toEqual([
    { path: "values.amount", message: '"amount" must be a number.' },
  ]);
});

test("column ids are slugs of the name, deduped and stable", () => {
  expect(columnIdFrom("Wallet address")).toBe("wallet_address");
  expect(columnIdFrom("E-mail!")).toBe("e_mail");
  expect(columnIdFrom("Email", ["email"])).toBe("email_2");
  expect(columnIdFrom("Email", ["email", "email_2"])).toBe("email_3");
  expect(columnIdFrom("€€€")).toBe("column");
  expect(columnIdFrom("2026 total")).toBe("2026_total");
  expect(columnIdFrom("x".repeat(80))).toHaveLength(64);
});
