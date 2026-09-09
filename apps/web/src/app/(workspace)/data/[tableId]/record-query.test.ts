/// <reference types="bun" />
import type { DataColumn } from "@automator/contracts";
import { expect, test } from "bun:test";
import {
  isNarrowed,
  parseRecordQuery,
  recordHref,
  recordsHref,
  type RecordQuery,
} from "./record-query";

const columns: DataColumn[] = [
  { id: "email", name: "Email", type: "text", required: true },
  { id: "seats", name: "Seats", type: "number", required: false },
];

test("a plain table has a plain URL", () => {
  expect(recordsHref("tbl-1", {})).toBe("/data/tbl-1");
  expect(recordsHref("tbl-1", { filters: [] })).toBe("/data/tbl-1");
});

test("a filter, a sort and a search survive the round trip", () => {
  const query: RecordQuery = {
    filters: [{ column: "email", operator: "contains", value: "ada" }],
    sort: { column: "email", direction: "asc" },
    search: "lovelace",
  };
  const href = recordsHref("tbl-1", query);
  const params = Object.fromEntries(new URL(href, "https://x.test").searchParams);
  expect(parseRecordQuery(params, columns)).toEqual(query);
});

test("a filter naming a column the table lost is dropped, not refused", () => {
  const params = {
    filters: JSON.stringify([{ column: "nickname", operator: "equals", value: "ada" }]),
  };
  expect(parseRecordQuery(params, columns).filters).toEqual([]);
});

test("malformed parts are ignored so a stale link still opens the table", () => {
  const parsed = parseRecordQuery({ filters: "nonsense", sort: "email", q: "   " }, columns);
  expect(parsed.filters).toEqual([]);
  expect(parsed.sort).toBeUndefined();
  expect(parsed.search).toBeUndefined();
});

test("a sort needs a direction the grid understands", () => {
  expect(parseRecordQuery({ sort: "email:sideways" }, columns).sort).toBeUndefined();
  expect(parseRecordQuery({ sort: "seats:desc" }, columns).sort).toEqual({
    column: "seats",
    direction: "desc",
  });
});

test("only a narrowed list gives up cursor paging", () => {
  expect(isNarrowed({ filters: [] })).toBe(false);
  expect(isNarrowed({ filters: [], cursor: "abc" })).toBe(false);
  expect(isNarrowed({ filters: [], search: "ada" })).toBe(true);
  expect(isNarrowed({ filters: [], sort: { column: "email", direction: "asc" } })).toBe(true);
});

test("a record opens beside the list it was found in", () => {
  const query: RecordQuery = { filters: [], search: "ada" };
  expect(recordHref("tbl-1", "rec-1", query)).toBe("/data/tbl-1/rec-1?q=ada");
  expect(recordHref("tbl-1", "rec-1", { filters: [] })).toBe("/data/tbl-1/rec-1");
});
