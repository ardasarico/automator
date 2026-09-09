import { describe, expect, test } from "bun:test";
import {
  deleteDataTableContract,
  documentOutline,
  documentTriggers,
  getDataTableContract,
  getDataRecordContract,
  listDataRecordsContract,
  listDataTablesContract,
  parseResponse,
  type DataColumn,
  type DataRecord,
  type DataTable,
  type DataTableInput,
  type FlowDocument,
  type FlowRecord,
} from "@automator/contracts";
import {
  DataColumnDuplicateError,
  DataColumnTypeLockedError,
  DataLimitError,
  DataRecordCursorError,
  documentTriggerTypes,
  type DataRecordStore,
  type DataTableStore,
  type FlowStore,
} from "@automator/db";
import { createApp } from "../app";
import type { IdentityProvider } from "../auth/privy";

const columns: DataColumn[] = [
  { id: "email", name: "Email", type: "text", required: true },
  { id: "seats", name: "Seats", type: "number", required: false },
  { id: "wallet", name: "Wallet", type: "address", required: false },
];

const table: DataTableInput = { name: "Signups", description: "One per visitor.", columns };

/** Caps small enough to reach in a test; the route only cares that the store refuses. */
const tableCap = 2;
const recordCap = 2;

function fixture(options: { callsPerMinute?: number; flows?: readonly FlowDocument[] } = {}) {
  const tables = new Map<string, { ownerId: string; table: DataTable }>();
  const records = new Map<string, { ownerId: string; record: DataRecord }>();
  let clock = 0;
  const stamp = () => new Date(1_757_400_000_000 + clock++ * 1000).toISOString();
  const ownedTable = (ownerId: string, id: string) => {
    const entry = tables.get(id);
    return entry && entry.ownerId === ownerId ? entry : undefined;
  };
  const countOf = (tableId: string) =>
    [...records.values()].filter((entry) => entry.record.tableId === tableId).length;
  const withCount = (found: DataTable): DataTable => ({
    ...found,
    recordCount: countOf(found.id),
  });
  const assertColumns = (input: DataTableInput) => {
    const seen = new Set<string>();
    for (const column of input.columns) {
      if (seen.has(column.id)) throw new DataColumnDuplicateError(column.id);
      seen.add(column.id);
    }
  };

  const dataTables: DataTableStore = {
    list: async (ownerId) =>
      [...tables.values()]
        .filter((entry) => entry.ownerId === ownerId)
        .map((entry) => withCount(entry.table)),
    get: async (ownerId, id) => {
      const entry = ownedTable(ownerId, id);
      return entry ? withCount(entry.table) : null;
    },
    create: async (ownerId, input) => {
      assertColumns(input);
      if ([...tables.values()].filter((entry) => entry.ownerId === ownerId).length >= tableCap)
        throw new DataLimitError("too many tables");
      const at = stamp();
      const created: DataTable = {
        id: `tbl-${tables.size + 1}`,
        name: input.name,
        ...(input.description === undefined ? {} : { description: input.description }),
        columns: input.columns,
        recordCount: 0,
        createdAt: at,
        updatedAt: at,
      };
      tables.set(created.id, { ownerId, table: created });
      return created;
    },
    update: async (ownerId, id, input) => {
      assertColumns(input);
      const entry = ownedTable(ownerId, id);
      if (!entry) return null;
      if (countOf(id) > 0)
        for (const column of input.columns) {
          const before = entry.table.columns.find((candidate) => candidate.id === column.id);
          if (before && before.type !== column.type) throw new DataColumnTypeLockedError(column.id);
        }
      const updated: DataTable = {
        ...entry.table,
        name: input.name,
        ...(input.description === undefined ? {} : { description: input.description }),
        columns: input.columns,
        updatedAt: stamp(),
      };
      tables.set(id, { ownerId, table: updated });
      return withCount(updated);
    },
    remove: async (ownerId, id) => {
      if (!ownedTable(ownerId, id)) return false;
      tables.delete(id);
      for (const [key, entry] of records) if (entry.record.tableId === id) records.delete(key);
      return true;
    },
  };

  const ownedRecords = (ownerId: string, tableId: string) =>
    [...records.values()]
      .filter((entry) => entry.ownerId === ownerId && entry.record.tableId === tableId)
      .map((entry) => entry.record);

  const dataRecords: DataRecordStore = {
    list: async (ownerId, tableId, { cursor, limit = 25 } = {}) => {
      if (cursor !== undefined && !/^[0-9]+$/.test(cursor)) throw new DataRecordCursorError();
      const all = ownedRecords(ownerId, tableId);
      const from = cursor === undefined ? 0 : Number(cursor);
      const page = all.slice(from, from + limit);
      return from + limit < all.length
        ? { records: page, nextCursor: String(from + limit) }
        : { records: page };
    },
    get: async (ownerId, tableId, id) =>
      ownedRecords(ownerId, tableId).find((record) => record.id === id) ?? null,
    find: async (ownerId, tableId, query = {}) => {
      /* Enough of the store's semantics for the route's own behaviour to be observable: the
       * operators the SQL is tested against live in packages/db's integration suite. */
      const text = (record: DataRecord, column: string) => {
        const value = record.values[column];
        return value === undefined || value === null ? "" : String(value);
      };
      let matched = ownedRecords(ownerId, tableId).filter((record) =>
        (query.filters ?? []).every((filter) => {
          const value = text(record, filter.column);
          const wanted = filter.value === undefined ? "" : String(filter.value);
          switch (filter.operator) {
            case "equals":
              return value === wanted;
            case "not_equals":
              return value !== wanted;
            case "contains":
              return value.toLowerCase().includes(wanted.toLowerCase());
            case "is_empty":
              return value === "";
            case "is_not_empty":
              return value !== "";
            default:
              return true;
          }
        }),
      );
      const search = query.search;
      if (search && search.columns.length > 0)
        matched = matched.filter((record) =>
          search.columns.some((column) =>
            text(record, column).toLowerCase().includes(search.text.toLowerCase()),
          ),
        );
      const sort = query.sort;
      if (sort)
        matched = [...matched].sort((left, right) =>
          sort.direction === "asc"
            ? text(left, sort.column).localeCompare(text(right, sort.column))
            : text(right, sort.column).localeCompare(text(left, sort.column)),
        );
      const limit = query.limit ?? 25;
      return { records: matched.slice(0, limit), truncated: matched.length > limit };
    },
    create: async (ownerId, tableId, values) => {
      if (!ownedTable(ownerId, tableId)) return null;
      if (ownedRecords(ownerId, tableId).length >= recordCap)
        throw new DataLimitError("too many records");
      const at = stamp();
      const record: DataRecord = {
        id: `rec-${records.size + 1}`,
        tableId,
        values,
        createdAt: at,
        updatedAt: at,
      };
      records.set(record.id, { ownerId, record });
      return record;
    },
    update: async (ownerId, tableId, id, values) => {
      const found = ownedRecords(ownerId, tableId).find((record) => record.id === id);
      if (!found) return null;
      const record: DataRecord = { ...found, values, updatedAt: stamp() };
      records.set(id, { ownerId, record });
      return record;
    },
    merge: async (ownerId, tableId, id, resolve, options = {}) => {
      const found = ownedRecords(ownerId, tableId).find((record) => record.id === id);
      if (!found) return null;
      if (options.expectedUpdatedAt && options.expectedUpdatedAt !== found.updatedAt)
        return "conflict";
      const values = resolve(found.values);
      if (!values) return "invalid";
      const record: DataRecord = { ...found, values, updatedAt: stamp() };
      records.set(id, { ownerId, record });
      return record;
    },
    remove: async (ownerId, tableId, id) => {
      const found = ownedRecords(ownerId, tableId).find((record) => record.id === id);
      if (!found) return null;
      records.delete(id);
      return found;
    },
  };

  const documents = options.flows ?? [];
  const asRecord = (document: FlowDocument): FlowRecord => ({
    flow: document,
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
    enabled: false,
    webhookToken: `token-${document.id}`,
  });
  const flows = {
    list: async (ownerId: string) =>
      ownerId === "did:privy:alice"
        ? documents.map((document) => ({
            id: document.id,
            name: document.name,
            description: document.description,
            updatedAt: "2026-09-08T00:00:00.000Z",
            enabled: false,
            triggerTypes: documentTriggerTypes(document.nodes),
            triggers: documentTriggers(document.nodes),
            nodeCount: document.nodes.length,
            outline: documentOutline(document),
          }))
        : [],
    find: async (ownerId: string, id: string) => {
      const document =
        ownerId === "did:privy:alice" ? documents.find((f) => f.id === id) : undefined;
      return document ? asRecord(document) : null;
    },
    create: async () => {
      throw new Error("Storage must not be called");
    },
    update: async () => null,
    delete: async () => false,
    findPublished: async () => null,
    findPublishedWithOwner: async () => null,
    setEnabled: async () => null,
    findForWebhook: async () => null,
    listEnabled: async () => [],
    isCurrentPoll: async () => true,
  } as unknown as FlowStore;

  const identity: IdentityProvider = {
    verify: async (token) =>
      ["alice", "bob"].includes(token) ? { id: `did:privy:${token}`, expiresAt: 2e9 } : null,
    walletAddress: async () => null,
  };
  const app = createApp({
    database: { check: async () => "up" },
    flows,
    dataTables,
    dataRecords,
    identity,
    ...(options.callsPerMinute === undefined
      ? {}
      : { rateLimits: { data: options.callsPerMinute } }),
  });
  const request = (path: string, method = "GET", token?: string, body?: unknown) =>
    app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  const createTable = async (input: DataTableInput = table, token = "alice") =>
    (await (await request("/data/tables", "POST", token, input)).json()) as DataTable;
  return { request, createTable, records };
}

function flowUsing(tableId: string, id = "flow-1", name = "Signup flow"): FlowDocument {
  return {
    version: 1,
    id,
    name,
    description: "",
    nodes: [
      { id: "n1", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Run", config: {} },
      {
        id: "n2",
        type: "data.create-record",
        position: { x: 300, y: 0 },
        label: "Save",
        config: { tableId, values: [] },
      },
    ],
    edges: [{ id: "e1", source: "n1", sourceHandle: "run", target: "n2", targetHandle: "values" }],
  };
}

describe("data table routes", () => {
  test.each([undefined, "forged"])("token %s is rejected on every route", async (token) => {
    const { request } = fixture();
    for (const [path, method, body] of [
      ["/data/tables", "GET", undefined],
      ["/data/tables", "POST", table],
      ["/data/tables/tbl-1", "GET", undefined],
      ["/data/tables/tbl-1", "PATCH", table],
      ["/data/tables/tbl-1", "DELETE", undefined],
      ["/data/tables/tbl-1/records", "GET", undefined],
      ["/data/tables/tbl-1/records", "POST", { values: {} }],
      ["/data/tables/tbl-1/records/rec-1", "PATCH", { values: {} }],
      ["/data/tables/tbl-1/records/rec-1", "DELETE", undefined],
    ] as const) {
      const response = await request(path, method, token, body);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthorized" });
    }
  });

  test("creates, reads back, lists and updates a table", async () => {
    const { request, createTable } = fixture();
    const created = await createTable();
    expect(created).toMatchObject({ name: "Signups", recordCount: 0, columns });

    const read = await request(`/data/tables/${created.id}`, "GET", "alice");
    expect(parseResponse(getDataTableContract, read.status, await read.json()).data).toEqual(
      created,
    );

    const listed = await request("/data/tables", "GET", "alice");
    expect(parseResponse(listDataTablesContract, listed.status, await listed.json()).data).toEqual({
      tables: [created],
    });

    const renamed = await request(`/data/tables/${created.id}`, "PATCH", "alice", {
      ...table,
      name: "Waitlist",
    });
    expect(renamed.status).toBe(200);
    expect((await renamed.json()) as DataTable).toMatchObject({ id: created.id, name: "Waitlist" });
  });

  test("another owner's table is not found on any route and never listed", async () => {
    const { request, createTable } = fixture();
    const created = await createTable();
    for (const [path, method, body] of [
      [`/data/tables/${created.id}`, "GET", undefined],
      [`/data/tables/${created.id}`, "PATCH", table],
      [`/data/tables/${created.id}`, "DELETE", undefined],
      [`/data/tables/${created.id}/records`, "GET", undefined],
      [`/data/tables/${created.id}/records`, "POST", { values: { email: "a@b.co" } }],
    ] as const) {
      const response = await request(path, method, "bob", body);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found" });
    }
    expect(await (await request("/data/tables", "GET", "bob")).json()).toEqual({ tables: [] });
  });

  test("a column of an unknown type is unprocessable", async () => {
    const { request } = fixture();
    const response = await request("/data/tables", "POST", "alice", {
      name: "Broken",
      columns: [{ id: "when", name: "When", type: "colour", required: false }],
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "invalid_table" });
  });

  test("two columns with the same id are unprocessable", async () => {
    const { request } = fixture();
    const response = await request("/data/tables", "POST", "alice", {
      name: "Broken",
      columns: [columns[0]!, columns[0]!],
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "invalid_table" });
  });

  test("the table cap answers 409", async () => {
    const { request, createTable } = fixture();
    await createTable();
    await createTable();
    const refused = await request("/data/tables", "POST", "alice", table);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: "invalid_table" });
  });

  test("changing a column's type once records exist answers 409", async () => {
    const { request, createTable } = fixture();
    const created = await createTable();
    await request(`/data/tables/${created.id}/records`, "POST", "alice", {
      values: { email: "a@b.co" },
    });
    const refused = await request(`/data/tables/${created.id}`, "PATCH", "alice", {
      ...table,
      columns: [{ ...columns[0]!, type: "number" }, columns[1]!, columns[2]!],
    });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: "invalid_table" });
  });

  test("writes past the per-minute budget answer 429 while reads still work", async () => {
    const { request, createTable } = fixture({ callsPerMinute: 1 });
    await createTable();
    const limited = await request("/data/tables", "POST", "alice", table);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect(await limited.json()).toEqual({ error: "rate_limited" });
    expect((await request("/data/tables", "GET", "alice")).status).toBe(200);
  });
});

describe("data record routes", () => {
  test("creates, validates, updates and deletes a record", async () => {
    const { request, createTable } = fixture();
    const created = await createTable();
    const posted = await request(`/data/tables/${created.id}/records`, "POST", "alice", {
      values: { email: "a@b.co", seats: 2, wallet: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" },
    });
    expect(posted.status).toBe(201);
    const record = (await posted.json()) as DataRecord;
    // Values are stored normalized: the address lowercased, the number kept as a number.
    expect(record.values).toEqual({
      email: "a@b.co",
      seats: 2,
      wallet: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    const patched = await request(
      `/data/tables/${created.id}/records/${record.id}`,
      "PATCH",
      "alice",
      { values: { email: "c@d.co" } },
    );
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as DataRecord).values).toEqual({ email: "c@d.co" });

    const removed = await request(
      `/data/tables/${created.id}/records/${record.id}`,
      "DELETE",
      "alice",
    );
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ id: record.id });
    expect(
      (await request(`/data/tables/${created.id}/records/${record.id}`, "DELETE", "alice")).status,
    ).toBe(404);
  });

  test("a merge patch changes one column, clears with null and keeps the rest", async () => {
    const { request, createTable } = fixture();
    const created = await createTable();
    const posted = await request(`/data/tables/${created.id}/records`, "POST", "alice", {
      values: { email: "a@b.co", seats: 2 },
    });
    const record = (await posted.json()) as DataRecord;
    const path = `/data/tables/${created.id}/records/${record.id}`;

    const merged = await request(path, "PATCH", "alice", {
      values: { seats: 5 },
      merge: true,
      expectedUpdatedAt: record.updatedAt,
    });
    expect(merged.status).toBe(200);
    const after = (await merged.json()) as DataRecord;
    expect(after.values).toEqual({ email: "a@b.co", seats: 5 });

    const cleared = await request(path, "PATCH", "alice", {
      values: { seats: null },
      merge: true,
    });
    expect(((await cleared.json()) as DataRecord).values).toEqual({ email: "a@b.co" });
  });

  test("a merge patch answers 409 when the record changed since the caller read it", async () => {
    const { request, createTable } = fixture();
    const created = await createTable();
    const posted = await request(`/data/tables/${created.id}/records`, "POST", "alice", {
      values: { email: "a@b.co" },
    });
    const record = (await posted.json()) as DataRecord;
    const path = `/data/tables/${created.id}/records/${record.id}`;
    await request(path, "PATCH", "alice", { values: { seats: 1 }, merge: true });

    const stale = await request(path, "PATCH", "alice", {
      values: { seats: 3 },
      merge: true,
      expectedUpdatedAt: record.updatedAt,
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: "conflict" });
  });

  test("a replacing patch may carry the updatedAt the caller saw, and is refused when stale", async () => {
    const { request, createTable } = fixture();
    const created = await createTable();
    const posted = await request(`/data/tables/${created.id}/records`, "POST", "alice", {
      values: { email: "ada@lovelace.dev" },
    });
    const record = (await posted.json()) as DataRecord;

    const fresh = await request(
      `/data/tables/${created.id}/records/${record.id}`,
      "PATCH",
      "alice",
      { values: { email: "ada@byron.uk" }, expectedUpdatedAt: record.updatedAt },
    );
    expect(fresh.status).toBe(200);
    const saved = (await fresh.json()) as DataRecord;
    expect(saved.values).toEqual({ email: "ada@byron.uk" });

    // The caller is now holding a stale copy, and the second write is refused rather than applied.
    const stale = await request(
      `/data/tables/${created.id}/records/${record.id}`,
      "PATCH",
      "alice",
      { values: { email: "someone@else.test" }, expectedUpdatedAt: record.updatedAt },
    );
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: "conflict" });
  });

  test("a merge patch that would empty a required column is unprocessable", async () => {
    const { request, createTable } = fixture();
    const created = await createTable();
    const posted = await request(`/data/tables/${created.id}/records`, "POST", "alice", {
      values: { email: "a@b.co" },
    });
    const record = (await posted.json()) as DataRecord;
    const cleared = await request(
      `/data/tables/${created.id}/records/${record.id}`,
      "PATCH",
      "alice",
      { values: { email: null }, merge: true },
    );
    expect(cleared.status).toBe(422);
    expect(await cleared.json()).toEqual({ error: "invalid_record" });
  });

  test.each([
    ["a value of the wrong type", { email: "a@b.co", seats: "many" }],
    ["a missing required value", { seats: 1 }],
    ["a malformed address", { email: "a@b.co", wallet: "0x1234" }],
    ["a value for a column the table does not have", { email: "a@b.co", nickname: "ada" }],
  ])("%s is unprocessable", async (_name, values) => {
    const { request, createTable } = fixture();
    const created = await createTable();
    const response = await request(`/data/tables/${created.id}/records`, "POST", "alice", {
      values,
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "invalid_record" });
  });

  test("the record cap answers 409", async () => {
    const { request, createTable } = fixture();
    const created = await createTable();
    const post = () =>
      request(`/data/tables/${created.id}/records`, "POST", "alice", {
        values: { email: "a@b.co" },
      });
    await post();
    await post();
    const refused = await post();
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: "invalid_record" });
  });

  test("records page by cursor and stop at the last page", async () => {
    const { request, createTable } = fixture();
    const created = await createTable();
    for (const email of ["a@b.co", "c@d.co"])
      await request(`/data/tables/${created.id}/records`, "POST", "alice", { values: { email } });

    const first = await request(`/data/tables/${created.id}/records?limit=1`, "GET", "alice");
    const page = parseResponse(listDataRecordsContract, first.status, await first.json());
    if (page.status !== 200) throw new Error("expected a page");
    expect(page.data.records).toHaveLength(1);
    expect(page.data.nextCursor).toBeString();

    const next = await request(
      `/data/tables/${created.id}/records?limit=1&cursor=${page.data.nextCursor}`,
      "GET",
      "alice",
    );
    const last = parseResponse(listDataRecordsContract, next.status, await next.json());
    if (last.status !== 200) throw new Error("expected a page");
    expect(last.data.records.map((record) => record.values.email)).toEqual(["c@d.co"]);
    expect(last.data.nextCursor).toBeUndefined();
  });

  test("one record reads back on its own, and another owner's does not", async () => {
    const { request, createTable } = fixture();
    const created = await createTable();
    const posted = await request(`/data/tables/${created.id}/records`, "POST", "alice", {
      values: { email: "ada@lovelace.dev" },
    });
    const { id } = (await posted.json()) as { id: string };

    const response = await request(`/data/tables/${created.id}/records/${id}`, "GET", "alice");
    const read = parseResponse(getDataRecordContract, response.status, await response.json());
    if (read.status !== 200) throw new Error("expected the record");
    expect(read.data.values.email).toBe("ada@lovelace.dev");

    const stranger = await request(`/data/tables/${created.id}/records/${id}`, "GET", "bob");
    expect(stranger.status).toBe(404);
    const missing = await request(`/data/tables/${created.id}/records/nope`, "GET", "alice");
    expect(missing.status).toBe(404);
  });

  test("a filter narrows the list to the records that match", async () => {
    const { request, createTable } = fixture();
    const created = await createTable();
    for (const email of ["ada@lovelace.dev", "grace@hopper.io"])
      await request(`/data/tables/${created.id}/records`, "POST", "alice", { values: { email } });

    const filters = encodeURIComponent(
      JSON.stringify([{ column: "email", operator: "contains", value: "ada" }]),
    );
    const response = await request(
      `/data/tables/${created.id}/records?filters=${filters}`,
      "GET",
      "alice",
    );
    const page = parseResponse(listDataRecordsContract, response.status, await response.json());
    if (page.status !== 200) throw new Error("expected a page");
    expect(page.data.records.map((record) => record.values.email)).toEqual(["ada@lovelace.dev"]);
  });

  test("a search matches across the table's text and address columns", async () => {
    const { request, createTable } = fixture();
    const created = await createTable();
    await request(`/data/tables/${created.id}/records`, "POST", "alice", {
      values: { email: "ada@lovelace.dev" },
    });
    await request(`/data/tables/${created.id}/records`, "POST", "alice", {
      values: { email: "grace@hopper.io" },
    });

    const response = await request(`/data/tables/${created.id}/records?q=hopper`, "GET", "alice");
    const page = parseResponse(listDataRecordsContract, response.status, await response.json());
    if (page.status !== 200) throw new Error("expected a page");
    expect(page.data.records.map((record) => record.values.email)).toEqual(["grace@hopper.io"]);
  });

  test("a sorted list orders by the named column", async () => {
    const { request, createTable } = fixture();
    const created = await createTable();
    for (const email of ["grace@hopper.io", "ada@lovelace.dev"])
      await request(`/data/tables/${created.id}/records`, "POST", "alice", { values: { email } });

    const response = await request(
      `/data/tables/${created.id}/records?sort=email:asc`,
      "GET",
      "alice",
    );
    const page = parseResponse(listDataRecordsContract, response.status, await response.json());
    if (page.status !== 200) throw new Error("expected a page");
    expect(page.data.records.map((record) => record.values.email)).toEqual([
      "ada@lovelace.dev",
      "grace@hopper.io",
    ]);
  });

  test("a filtered list pages no further, and says when more matched than it shows", async () => {
    const { request, createTable } = fixture();
    const created = await createTable();
    for (const email of ["ada@lovelace.dev", "ada@byron.uk"])
      await request(`/data/tables/${created.id}/records`, "POST", "alice", { values: { email } });

    const filters = encodeURIComponent(
      JSON.stringify([{ column: "email", operator: "contains", value: "ada" }]),
    );
    const response = await request(
      `/data/tables/${created.id}/records?filters=${filters}&limit=1`,
      "GET",
      "alice",
    );
    const page = parseResponse(listDataRecordsContract, response.status, await response.json());
    if (page.status !== 200) throw new Error("expected a page");
    expect(page.data.records).toHaveLength(1);
    expect(page.data.nextCursor).toBeUndefined();
    expect(page.data.truncated).toBe(true);
  });

  test("a filter the table cannot answer is a bad request, not an empty page", async () => {
    const { request, createTable } = fixture();
    const created = await createTable();

    const unknownColumn = encodeURIComponent(
      JSON.stringify([{ column: "nickname", operator: "equals", value: "ada" }]),
    );
    const missing = await request(
      `/data/tables/${created.id}/records?filters=${unknownColumn}`,
      "GET",
      "alice",
    );
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: "invalid_request" });

    /* "seats" is a number column, and dataColumnOperators gives numbers no "contains". */
    const wrongOperator = encodeURIComponent(
      JSON.stringify([{ column: "seats", operator: "contains", value: "2" }]),
    );
    const forbidden = await request(
      `/data/tables/${created.id}/records?filters=${wrongOperator}`,
      "GET",
      "alice",
    );
    expect(forbidden.status).toBe(400);

    const malformed = await request(
      `/data/tables/${created.id}/records?filters=nonsense`,
      "GET",
      "alice",
    );
    expect(malformed.status).toBe(400);
  });

  test("an unreadable sort is a bad request", async () => {
    const { request, createTable } = fixture();
    const created = await createTable();
    for (const sort of ["email", "email:sideways", "nickname:asc"]) {
      const response = await request(
        `/data/tables/${created.id}/records?sort=${sort}`,
        "GET",
        "alice",
      );
      expect(response.status).toBe(400);
    }
  });

  test("an unreadable limit is a bad request and an unreadable cursor is unprocessable", async () => {
    const { request, createTable } = fixture();
    const created = await createTable();
    const badLimit = await request(`/data/tables/${created.id}/records?limit=all`, "GET", "alice");
    expect(badLimit.status).toBe(400);
    expect(await badLimit.json()).toEqual({ error: "invalid_request" });
    const badCursor = await request(
      `/data/tables/${created.id}/records?cursor=%20`,
      "GET",
      "alice",
    );
    expect(badCursor.status).toBe(422);
    expect(await badCursor.json()).toEqual({ error: "invalid_record" });
  });
});

describe("DELETE /data/tables/:id", () => {
  test("a table no flow references is deleted straight away", async () => {
    const { request, createTable } = fixture();
    const created = await createTable();
    const response = await request(`/data/tables/${created.id}`, "DELETE", "alice");
    expect(
      parseResponse(deleteDataTableContract, response.status, await response.json()).data,
    ).toEqual({ deleted: true, usedBy: [] });
    expect((await request(`/data/tables/${created.id}`, "GET", "alice")).status).toBe(404);
  });

  test("a table a flow still reads names the flow and waits for confirmation", async () => {
    const { request, createTable } = fixture({ flows: [flowUsing("tbl-1")] });
    const created = await createTable();
    expect(created.id).toBe("tbl-1");

    const warned = await request(`/data/tables/${created.id}`, "DELETE", "alice");
    expect(warned.status).toBe(200);
    expect(await warned.json()).toEqual({
      deleted: false,
      usedBy: [{ id: "flow-1", name: "Signup flow" }],
    });
    expect((await request(`/data/tables/${created.id}`, "GET", "alice")).status).toBe(200);

    const confirmed = await request(`/data/tables/${created.id}?confirm=1`, "DELETE", "alice");
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toEqual({
      deleted: true,
      usedBy: [{ id: "flow-1", name: "Signup flow" }],
    });
    expect((await request(`/data/tables/${created.id}`, "GET", "alice")).status).toBe(404);
  });
});
