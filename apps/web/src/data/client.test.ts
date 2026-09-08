/// <reference types="bun" />
import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import type { DataRecord, DataTable } from "@automator/contracts";
import {
  createDataRecordRequest,
  createDataTableRequest,
  DataRequestError,
  deleteDataRecordRequest,
  deleteDataTableRequest,
  listDataRecordsRequest,
  listDataTablesRequest,
  updateDataRecordRequest,
  updateDataTableRequest,
} from "./client";

const table: DataTable = {
  id: "tbl-1",
  name: "Signups",
  columns: [{ id: "email", name: "Email", type: "text", required: true }],
  recordCount: 1,
  createdAt: "2026-09-08T10:00:00.000Z",
  updatedAt: "2026-09-08T10:00:00.000Z",
};
const record: DataRecord = {
  id: "rec-1",
  tableId: "tbl-1",
  values: { email: "a@b.co" },
  createdAt: "2026-09-08T10:00:00.000Z",
  updatedAt: "2026-09-08T10:00:00.000Z",
};
const tableInput = { name: "Signups", columns: table.columns };
const recordInput = { values: { email: "a@b.co" } };

let answer: () => Promise<Response> = async () => Response.json({ tables: [table] });
const calls: Array<{
  url: string;
  method: string;
  authorization: string | null;
  contentType: string | null;
  body: unknown;
}> = [];

const originalFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    calls.push({
      url: String(url),
      method: init.method ?? "GET",
      authorization: headers.get("authorization"),
      contentType: headers.get("content-type"),
      body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
    });
    return answer();
  }) as unknown as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = originalFetch;
});
beforeEach(() => {
  calls.length = 0;
  answer = async () => Response.json({ tables: [table] });
});

test("the table list is read through the proxy with the bearer token", async () => {
  expect(await listDataTablesRequest("privy-token")).toEqual([table]);
  expect(calls).toEqual([
    {
      url: "/api/data/tables",
      method: "GET",
      authorization: "Bearer privy-token",
      contentType: null,
      body: undefined,
    },
  ]);
});

test("a table is created at 201 and updated at 200", async () => {
  answer = async () => Response.json(table, { status: 201 });
  expect(await createDataTableRequest("privy-token", tableInput)).toEqual(table);
  expect(calls[0]).toMatchObject({
    url: "/api/data/tables",
    method: "POST",
    contentType: "application/json",
    body: tableInput,
  });

  answer = async () => Response.json(table);
  expect(await updateDataTableRequest("tbl-1", "privy-token", tableInput)).toEqual(table);
  expect(calls[1]).toMatchObject({
    url: "/api/data/tables/tbl-1",
    method: "PATCH",
    body: tableInput,
  });
});

test("deleting a table in use reports the flows that reference it", async () => {
  answer = async () => Response.json({ deleted: false, usedBy: [{ id: "flow-1", name: "Ping" }] });
  expect(await deleteDataTableRequest("tbl-1", "privy-token")).toEqual({
    deleted: false,
    usedBy: [{ id: "flow-1", name: "Ping" }],
  });
  expect(calls[0]).toMatchObject({ url: "/api/data/tables/tbl-1", method: "DELETE" });
});

test("confirming the delete adds the query flag", async () => {
  answer = async () => Response.json({ deleted: true, usedBy: [] });
  expect(await deleteDataTableRequest("tbl-1", "privy-token", { confirm: true })).toEqual({
    deleted: true,
    usedBy: [],
  });
  expect(calls[0]?.url).toBe("/api/data/tables/tbl-1?confirm=1");
});

test("records page through the cursor and the limit", async () => {
  answer = async () => Response.json({ records: [record], nextCursor: "cursor-2" });
  expect(
    await listDataRecordsRequest("tbl-1", "privy-token", { cursor: "abc", limit: 50 }),
  ).toEqual({ records: [record], nextCursor: "cursor-2" });
  expect(calls[0]?.url).toBe("/api/data/tables/tbl-1/records?cursor=abc&limit=50");

  answer = async () => Response.json({ records: [] });
  expect(await listDataRecordsRequest("tbl-1", "privy-token")).toEqual({ records: [] });
  expect(calls[1]?.url).toBe("/api/data/tables/tbl-1/records");
});

test("records are created, edited and removed under the table path", async () => {
  answer = async () => Response.json(record, { status: 201 });
  expect(await createDataRecordRequest("tbl-1", "privy-token", recordInput)).toEqual(record);
  expect(calls[0]).toMatchObject({
    url: "/api/data/tables/tbl-1/records",
    method: "POST",
    body: recordInput,
  });

  answer = async () => Response.json(record);
  expect(await updateDataRecordRequest("tbl-1", "rec-1", "privy-token", recordInput)).toEqual(
    record,
  );
  expect(calls[1]).toMatchObject({
    url: "/api/data/tables/tbl-1/records/rec-1",
    method: "PATCH",
    body: recordInput,
  });

  answer = async () => Response.json({ id: "rec-1" });
  expect(await deleteDataRecordRequest("tbl-1", "rec-1", "privy-token")).toEqual({ id: "rec-1" });
  expect(calls[2]).toMatchObject({
    url: "/api/data/tables/tbl-1/records/rec-1",
    method: "DELETE",
  });
});

test("ids are path-encoded", async () => {
  answer = async () => Response.json(record);
  await updateDataRecordRequest("a/b", "c d", "privy-token", recordInput);
  expect(calls[0]?.url).toBe("/api/data/tables/a%2Fb/records/c%20d");
});

test("a refused write surfaces the API error code", async () => {
  answer = async () => Response.json({ error: "invalid_record" }, { status: 422 });
  await expect(createDataRecordRequest("tbl-1", "privy-token", recordInput)).rejects.toEqual(
    new DataRequestError("invalid_record"),
  );
});

test("a missing token never reaches the network", async () => {
  await expect(listDataTablesRequest(null)).rejects.toEqual(new DataRequestError("unauthorized"));
  await expect(createDataTableRequest(null, tableInput)).rejects.toEqual(
    new DataRequestError("unauthorized"),
  );
  expect(calls).toHaveLength(0);
});

test("a response that is not JSON reads as an outage", async () => {
  answer = async () => new Response("<html>502</html>", { status: 502 });
  await expect(listDataTablesRequest("privy-token")).rejects.toEqual(
    new DataRequestError("unavailable"),
  );
});

test("an unexpected status is a contract violation, not an error code", async () => {
  answer = async () => Response.json({ error: "not_found" }, { status: 418 });
  await expect(listDataTablesRequest("privy-token")).rejects.toThrow(/Unexpected status 418/);
});
