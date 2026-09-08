/// <reference types="bun" />
import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import type { DataRecord, DataTable, DataTableInput } from "@automator/contracts";

mock.module("server-only", () => ({}));

const tableInput: DataTableInput = {
  name: "Signups",
  columns: [{ id: "email", name: "Email", type: "text", required: true }],
};
const table: DataTable = {
  ...tableInput,
  id: "tbl-1",
  recordCount: 0,
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
const recordInput = { values: record.values };

let answer: () => Promise<Response> = async () => Response.json({ tables: [table] });
const calls: Array<{ url: string; method: string; authorization: string | null; body: unknown }> =
  [];

const { GET: listTables, POST: createTable } = await import("./route");
const { DELETE: deleteTable, GET: getTable, PATCH: updateTable } = await import("./[id]/route");
const { GET: listRecords, POST: createRecord } = await import("./[id]/records/route");
const { DELETE: deleteRecord, PATCH: updateRecord } =
  await import("./[id]/records/[recordId]/route");

const originalFetch = globalThis.fetch;
const originalApiUrl = process.env.API_URL;
const originalWarn = console.warn;

beforeAll(() => {
  process.env.API_URL = "http://api.internal:3001";
  console.warn = () => {};
  globalThis.fetch = (async (url: URL, init: RequestInit) => {
    calls.push({
      url: String(url),
      method: init.method ?? "GET",
      authorization: new Headers(init.headers).get("authorization"),
      body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
    });
    return answer();
  }) as unknown as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
  if (originalApiUrl === undefined) delete process.env.API_URL;
  else process.env.API_URL = originalApiUrl;
});
beforeEach(() => {
  calls.length = 0;
  answer = async () => Response.json({ tables: [table] });
});

const origin = "https://app.automator.dev";
const signedIn = {
  origin,
  authorization: "Bearer privy-token",
  "content-type": "application/json",
};
const tableParams = { params: Promise.resolve({ id: "tbl-1" }) };
const recordParams = { params: Promise.resolve({ id: "tbl-1", recordId: "rec-1" }) };

function req(path: string, method: string, headers: Record<string, string>, body?: unknown) {
  return new Request(`${origin}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("the table list is forwarded with the bearer token", async () => {
  const response = await listTables(req("/api/data/tables", "GET", signedIn));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ tables: [table] });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(calls).toEqual([
    {
      url: "http://api.internal:3001/data/tables",
      method: "GET",
      authorization: "Bearer privy-token",
      body: undefined,
    },
  ]);
});

test("a created table is relayed at 201", async () => {
  answer = async () => Response.json(table, { status: 201 });
  const response = await createTable(req("/api/data/tables", "POST", signedIn, tableInput));
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual(table);
  expect(calls[0]).toMatchObject({ method: "POST", body: tableInput });
});

test("an invalid table never reaches the API", async () => {
  const response = await createTable(
    req("/api/data/tables", "POST", signedIn, {
      name: "Signups",
      columns: [{ id: "email", name: "Email", type: "colour", required: false }],
    }),
  );
  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({ error: "invalid_table" });
  expect(calls).toHaveLength(0);
});

test("unreadable JSON is a bad request", async () => {
  const response = await createTable(req("/api/data/tables", "POST", signedIn, "{ nope"));
  expect(response.status).toBe(400);
  expect(calls).toHaveLength(0);
});

test.each([
  ["a foreign origin", { ...signedIn, origin: "https://evil.example" }, 403],
  ["no token", { origin, "content-type": "application/json" }, 401],
])("%s is refused before the API is called", async (_name, headers, status) => {
  const response = await createTable(req("/api/data/tables", "POST", headers, tableInput));
  expect(response.status).toBe(status);
  expect(calls).toHaveLength(0);
});

test("one table is read and its 404 is relayed", async () => {
  answer = async () => Response.json(table);
  const found = await getTable(req("/api/data/tables/tbl-1", "GET", signedIn), tableParams);
  expect(found.status).toBe(200);
  expect(await found.json()).toEqual(table);
  expect(calls[0]?.url).toBe("http://api.internal:3001/data/tables/tbl-1");

  answer = async () => Response.json({ error: "not_found" }, { status: 404 });
  const missing = await getTable(req("/api/data/tables/tbl-1", "GET", signedIn), tableParams);
  expect(missing.status).toBe(404);
  expect(await missing.json()).toEqual({ error: "not_found" });
});

test("a column change is forwarded and a broken one is refused", async () => {
  answer = async () => Response.json(table);
  const response = await updateTable(
    req("/api/data/tables/tbl-1", "PATCH", signedIn, tableInput),
    tableParams,
  );
  expect(response.status).toBe(200);
  expect(calls[0]).toMatchObject({ method: "PATCH", body: tableInput });

  const refused = await updateTable(
    req("/api/data/tables/tbl-1", "PATCH", signedIn, { name: "" }),
    tableParams,
  );
  expect(refused.status).toBe(422);
  expect(calls).toHaveLength(1);
});

test("a delete without confirmation reports the flows that use the table", async () => {
  answer = async () => Response.json({ deleted: false, usedBy: [{ id: "flow-1", name: "Ping" }] });
  const response = await deleteTable(
    req("/api/data/tables/tbl-1", "DELETE", signedIn),
    tableParams,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    deleted: false,
    usedBy: [{ id: "flow-1", name: "Ping" }],
  });
  expect(calls[0]?.url).toBe("http://api.internal:3001/data/tables/tbl-1");
});

test("the confirm flag is forwarded to the API", async () => {
  answer = async () => Response.json({ deleted: true, usedBy: [] });
  const response = await deleteTable(
    req("/api/data/tables/tbl-1?confirm=1", "DELETE", signedIn),
    tableParams,
  );
  expect(response.status).toBe(200);
  expect(calls[0]?.url).toBe("http://api.internal:3001/data/tables/tbl-1?confirm=1");
});

test("record paging forwards the cursor and the limit", async () => {
  answer = async () => Response.json({ records: [record], nextCursor: "cursor-2" });
  const response = await listRecords(
    req("/api/data/tables/tbl-1/records?cursor=abc&limit=50", "GET", signedIn),
    tableParams,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ records: [record], nextCursor: "cursor-2" });
  expect(calls[0]?.url).toBe(
    "http://api.internal:3001/data/tables/tbl-1/records?cursor=abc&limit=50",
  );
});

test("a record is created at 201 and a bad envelope is refused", async () => {
  answer = async () => Response.json(record, { status: 201 });
  const response = await createRecord(
    req("/api/data/tables/tbl-1/records", "POST", signedIn, recordInput),
    tableParams,
  );
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual(record);
  expect(calls[0]).toMatchObject({
    url: "http://api.internal:3001/data/tables/tbl-1/records",
    method: "POST",
    body: recordInput,
  });

  const refused = await createRecord(
    req("/api/data/tables/tbl-1/records", "POST", signedIn, { values: {}, extra: true }),
    tableParams,
  );
  expect(refused.status).toBe(422);
  expect(await refused.json()).toEqual({ error: "invalid_record" });
  expect(calls).toHaveLength(1);
});

test("a record is edited and removed under its table", async () => {
  answer = async () => Response.json(record);
  const edited = await updateRecord(
    req("/api/data/tables/tbl-1/records/rec-1", "PATCH", signedIn, recordInput),
    recordParams,
  );
  expect(edited.status).toBe(200);
  expect(calls[0]).toMatchObject({
    url: "http://api.internal:3001/data/tables/tbl-1/records/rec-1",
    method: "PATCH",
    body: recordInput,
  });

  answer = async () => Response.json({ id: "rec-1" });
  const removed = await deleteRecord(
    req("/api/data/tables/tbl-1/records/rec-1", "DELETE", signedIn),
    recordParams,
  );
  expect(removed.status).toBe(200);
  expect(await removed.json()).toEqual({ id: "rec-1" });
  expect(calls[1]).toMatchObject({ method: "DELETE" });
});

test("API errors are relayed by code", async () => {
  answer = async () => Response.json({ error: "rate_limited" }, { status: 429 });
  const response = await createRecord(
    req("/api/data/tables/tbl-1/records", "POST", signedIn, recordInput),
    tableParams,
  );
  expect(response.status).toBe(429);
  expect(await response.json()).toEqual({ error: "rate_limited" });
});

test("an unreachable API is a controlled 503", async () => {
  answer = async () => {
    throw new Error("connect ECONNREFUSED");
  };
  const response = await listTables(req("/api/data/tables", "GET", signedIn));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "unavailable" });
});

test("a request without a token is refused on every records route", async () => {
  const headers = { origin };
  const responses = await Promise.all([
    listRecords(req("/api/data/tables/tbl-1/records", "GET", headers), tableParams),
    deleteRecord(req("/api/data/tables/tbl-1/records/rec-1", "DELETE", headers), recordParams),
    deleteTable(req("/api/data/tables/tbl-1", "DELETE", headers), tableParams),
  ]);
  expect(responses.map((response) => response.status)).toEqual([401, 401, 401]);
  expect(calls).toHaveLength(0);
});
