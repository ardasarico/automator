import {
  parseNodeConfig,
  type FlowNode,
  type FlowNodeType,
  type Static,
  type TObject,
} from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { dataExecutors } from "./data-executors";
import type {
  DataFilter,
  DataProvider,
  DataQuery,
  DataRecord,
  DataTable,
  DataTarget,
} from "./data";
import type { ExecutionContext } from "./executor";
import { resolveTemplates } from "./template";

const table: DataTable = {
  id: "tbl_invoices",
  name: "Invoices",
  columns: [
    { id: "title", name: "Title", type: "text", required: true },
    { id: "amount", name: "Amount", type: "number" },
    { id: "paid", name: "Paid", type: "checkbox" },
    { id: "due", name: "Due", type: "datetime" },
    { id: "wallet", name: "Wallet", type: "address" },
  ],
};

const record: DataRecord = {
  id: "rec_1",
  tableId: table.id,
  values: { title: "Rent", amount: 1200, paid: false },
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

type Call =
  | { name: "table"; tableId: string }
  | { name: "find"; tableId: string; query: DataQuery }
  | { name: "resolve"; tableId: string; target: DataTarget }
  | { name: "create"; tableId: string; values: Record<string, unknown> }
  | { name: "update"; tableId: string; recordId: string; values: Record<string, unknown> }
  | { name: "remove"; tableId: string; recordId: string };

const writeNames = new Set(["create", "update", "remove"]);

function stubData(overrides: Partial<DataProvider> = {}, found: readonly DataRecord[] = [record]) {
  const calls: Call[] = [];
  const provider: DataProvider = {
    mode: "live",
    async table(tableId) {
      calls.push({ name: "table", tableId });
      return tableId === table.id ? table : null;
    },
    async find(tableId, query) {
      calls.push({ name: "find", tableId, query });
      return found;
    },
    async resolve(tableId, target) {
      calls.push({ name: "resolve", tableId, target });
      return found[0] ?? null;
    },
    async create(tableId, values) {
      calls.push({ name: "create", tableId, values });
      return { ...record, id: "rec_new", tableId, values };
    },
    async update(tableId, recordId, values) {
      calls.push({ name: "update", tableId, recordId, values });
      return { ...record, id: recordId, tableId, values, updatedAt: "2026-09-08T00:00:00.000Z" };
    },
    async remove(tableId, recordId) {
      calls.push({ name: "remove", tableId, recordId });
      return { ...record, id: recordId };
    },
    ...overrides,
  };
  const writes = () => calls.filter((call) => writeNames.has(call.name));
  return { provider, calls, writes };
}

const withStatus: DataTable = {
  ...table,
  columns: [
    ...table.columns,
    { id: "status", name: "Status", type: "select", required: true, options: ["open", "paid"] },
  ],
};

function asText(value: unknown): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** Matches a filter the way the record store does: over the text form of the stored value. */
function matches(record: DataRecord, filter: DataFilter): boolean {
  const stored = asText(record.values[filter.column]);
  const value = asText(filter.value);
  const numeric = value.trim() !== "" && Number.isFinite(Number(value));
  switch (filter.operator) {
    case "equals":
      return stored === value;
    case "not_equals":
      return stored !== value;
    case "contains":
      return stored.toLowerCase().includes(value.toLowerCase());
    case "greater_than":
      return stored !== "" && (numeric ? Number(stored) > Number(value) : stored > value);
    case "less_than":
      return stored !== "" && (numeric ? Number(stored) < Number(value) : stored < value);
    case "is_empty":
      return stored === "";
    case "is_not_empty":
      return stored !== "";
  }
}

/** A store that really keeps what the write path writes, so filters have something to match. */
function storeData() {
  const records: DataRecord[] = [];
  const at = "2026-09-08T12:00:00.000Z";
  const find = (query: DataQuery) =>
    records
      .filter((candidate) => (query.filters ?? []).every((filter) => matches(candidate, filter)))
      .slice(0, query.limit ?? records.length);
  const provider: DataProvider = {
    mode: "live",
    async table(tableId) {
      return tableId === table.id ? table : null;
    },
    async find(_tableId, query) {
      return find(query);
    },
    async resolve(_tableId, target) {
      if ("recordId" in target)
        return records.find((candidate) => candidate.id === target.recordId) ?? null;
      return find(target.query)[0] ?? null;
    },
    async create(tableId, values) {
      const created = {
        id: `rec_${records.length + 1}`,
        tableId,
        values,
        createdAt: at,
        updatedAt: at,
      };
      records.push(created);
      return created;
    },
    async update(_tableId, recordId, values) {
      const index = records.findIndex((candidate) => candidate.id === recordId);
      const updated = { ...records[index]!, values, updatedAt: at };
      records[index] = updated;
      return updated;
    },
    async remove(_tableId, recordId) {
      const index = records.findIndex((candidate) => candidate.id === recordId);
      return records.splice(index, 1)[0] ?? null;
    },
  };
  return { provider, records };
}

function context(
  type: FlowNodeType,
  config: Record<string, unknown>,
  data?: DataProvider,
  inputs: Record<string, unknown> = {},
): ExecutionContext {
  const node: FlowNode = { id: "n", type, position: { x: 0, y: 0 }, label: type, config };
  const scope = { input: inputs, vars: {}, trigger: undefined };
  return {
    node,
    inputs,
    trigger: undefined,
    variables: {},
    config: <T extends TObject>(schema: T) =>
      resolveTemplates(parseNodeConfig(schema, config), scope) as Static<T>,
    fetch,
    ...(data ? { data } : {}),
    now: () => new Date("2026-09-08T12:00:00.000Z"),
    sleep: async () => {},
  };
}

async function run(
  type: FlowNodeType,
  config: Record<string, unknown>,
  data?: DataProvider,
  inputs?: Record<string, unknown>,
) {
  const executor = dataExecutors[type]!;
  if (executor.kind === "screen") throw new Error("not a step");
  return executor.run(context(type, config, data, inputs));
}

const nodeTypes: FlowNodeType[] = [
  "data.create-record",
  "data.find-records",
  "data.update-record",
  "data.delete-record",
];

describe("data executors", () => {
  test.each(nodeTypes)("%s refuses a run with no data store", async (type) => {
    await expect(run(type, { tableId: table.id })).rejects.toThrow(
      "No data store is configured for this run",
    );
  });

  test.each(nodeTypes)("%s names a table it cannot resolve", async (type) => {
    const { provider, calls } = stubData();
    await expect(run(type, { tableId: "tbl_gone" }, provider)).rejects.toThrow(
      'Table "tbl_gone" was not found',
    );
    await expect(run(type, { tableId: "" }, provider)).rejects.toThrow(
      "This node has no table selected",
    );
    expect(calls.filter((call) => call.name === "table")).toHaveLength(1);
  });

  test("data.create-record writes the coerced values live", async () => {
    const { provider, calls } = stubData();
    const outputs = await run(
      "data.create-record",
      {
        tableId: table.id,
        values: [
          { column: "title", value: "Rent" },
          { column: "amount", value: "1200.50" },
          { column: "paid", value: "TRUE" },
          { column: "due", value: "2026-09-08T00:00:00Z" },
          { column: "wallet", value: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" },
        ],
      },
      provider,
    );
    expect(calls.at(-1)).toEqual({
      name: "create",
      tableId: table.id,
      values: {
        title: "Rent",
        amount: 1200.5,
        paid: true,
        due: "2026-09-08T00:00:00.000Z",
        wallet: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    });
    expect(outputs.record).toMatchObject({ id: "rec_new", tableId: table.id });
  });

  test("data.create-record simulates the record without writing", async () => {
    const { provider, writes } = stubData({ mode: "dry-run" });
    const outputs = await run(
      "data.create-record",
      { tableId: table.id, values: [{ column: "title", value: "Rent" }] },
      provider,
    );
    expect(outputs.record).toEqual({
      id: "simulated",
      tableId: table.id,
      values: { title: "Rent" },
      createdAt: "2026-09-08T12:00:00.000Z",
      updatedAt: "2026-09-08T12:00:00.000Z",
      simulated: true,
    });
    expect(writes()).toEqual([]);
  });

  test("data.create-record reports the problems with its values", async () => {
    const { provider, writes } = stubData();
    await expect(
      run("data.create-record", { tableId: table.id, values: [] }, provider),
    ).rejects.toThrow('"Title" is required.');
    await expect(
      run(
        "data.create-record",
        {
          tableId: table.id,
          values: [
            { column: "title", value: "Rent" },
            { column: "wallet", value: "not-an-address" },
          ],
        },
        provider,
      ),
    ).rejects.toThrow('"Wallet" must be a wallet address.');
    await expect(
      run(
        "data.create-record",
        { tableId: table.id, values: [{ column: "amount", value: "twelve" }] },
        provider,
      ),
    ).rejects.toThrow('"Amount" must be a number, not "twelve"');
    await expect(
      run(
        "data.create-record",
        { tableId: table.id, values: [{ column: "paid", value: "maybe" }] },
        provider,
      ),
    ).rejects.toThrow('"Paid" must be true or false, not "maybe"');
    await expect(
      run(
        "data.create-record",
        { tableId: table.id, values: [{ column: "nope", value: "x" }] },
        provider,
      ),
    ).rejects.toThrow('Table "Invoices" has no "nope" column');
    expect(writes()).toEqual([]);
  });

  test("data.create-record keeps checkbox and number values from templates", async () => {
    const { provider, calls } = stubData();
    await run(
      "data.create-record",
      {
        tableId: table.id,
        values: [
          { column: "title", value: "{{input.title}}" },
          { column: "amount", value: "{{input.amount}}" },
          { column: "paid", value: "{{input.paid}}" },
        ],
      },
      provider,
      { title: "Gas", amount: 42, paid: true },
    );
    expect(calls.at(-1)).toEqual({
      name: "create",
      tableId: table.id,
      values: { title: "Gas", amount: 42, paid: true },
    });
  });

  test("data.find-records reports the matches on found", async () => {
    const { provider, calls } = stubData();
    const outputs = await run(
      "data.find-records",
      {
        tableId: table.id,
        filters: [
          { column: "paid", operator: "equals", value: "false" },
          { column: "amount", operator: "greater_than", value: "100" },
        ],
        sortColumn: "due",
        sortDirection: "asc",
        limit: 10,
      },
      provider,
    );
    expect(calls.at(-1)).toEqual({
      name: "find",
      tableId: table.id,
      query: {
        filters: [
          { column: "paid", operator: "equals", value: false },
          { column: "amount", operator: "greater_than", value: 100 },
        ],
        sort: { column: "due", direction: "asc" },
        limit: 10,
      },
    });
    expect(outputs).toEqual({ found: { records: [record], count: 1, first: record } });
  });

  test("data.find-records reports empty when nothing matches", async () => {
    const { provider } = stubData({}, []);
    const outputs = await run("data.find-records", { tableId: table.id }, provider);
    expect(outputs).toEqual({ empty: { records: [], count: 0, first: null } });
  });

  test("data.find-records reads real data in dry-run", async () => {
    const { provider, calls, writes } = stubData({ mode: "dry-run" });
    const outputs = await run("data.find-records", { tableId: table.id }, provider);
    expect(calls.some((call) => call.name === "find")).toBe(true);
    expect(outputs).toEqual({ found: { records: [record], count: 1, first: record } });
    expect(writes()).toEqual([]);
  });

  test("data.update-record merges the new values over the stored ones", async () => {
    const { provider, calls } = stubData();
    const outputs = await run(
      "data.update-record",
      {
        tableId: table.id,
        target: "record",
        recordId: "{{input.record.id}}",
        values: [{ column: "paid", value: "true" }],
      },
      provider,
      { record: { id: "rec_1" } },
    );
    expect(calls).toContainEqual({
      name: "resolve",
      tableId: table.id,
      target: { recordId: "rec_1" },
    });
    expect(calls.at(-1)).toEqual({
      name: "update",
      tableId: table.id,
      recordId: "rec_1",
      values: { title: "Rent", amount: 1200, paid: true },
    });
    expect(outputs.record).toMatchObject({ values: { title: "Rent", paid: true } });
  });

  test("data.update-record resolves the first record a filter matches", async () => {
    const { provider, calls } = stubData();
    await run(
      "data.update-record",
      {
        tableId: table.id,
        target: "filter",
        filters: [{ column: "title", operator: "equals", value: "Rent" }],
        values: [{ column: "amount", value: "900" }],
      },
      provider,
    );
    expect(calls).toContainEqual({
      name: "resolve",
      tableId: table.id,
      target: {
        query: { filters: [{ column: "title", operator: "equals", value: "Rent" }], limit: 1 },
      },
    });
  });

  test("data.update-record refuses a missing target", async () => {
    const { provider } = stubData();
    await expect(
      run("data.update-record", { tableId: table.id, recordId: "" }, provider),
    ).rejects.toThrow("Update record needs a record id");
    const missing = stubData({}, []);
    await expect(
      run("data.update-record", { tableId: table.id, recordId: "rec_1" }, missing.provider),
    ).rejects.toThrow("No record matched");
    expect(missing.writes()).toEqual([]);
  });

  test("data.update-record simulates the merged record without writing", async () => {
    const { provider, writes } = stubData({ mode: "dry-run" });
    const outputs = await run(
      "data.update-record",
      { tableId: table.id, recordId: "rec_1", values: [{ column: "amount", value: "900" }] },
      provider,
    );
    expect(outputs.record).toEqual({
      ...record,
      values: { title: "Rent", amount: 900, paid: false },
      simulated: true,
    });
    expect(writes()).toEqual([]);
  });

  test("data.delete-record removes the resolved record", async () => {
    const { provider, calls } = stubData();
    const outputs = await run(
      "data.delete-record",
      { tableId: table.id, recordId: "rec_1" },
      provider,
    );
    expect(calls.at(-1)).toEqual({ name: "remove", tableId: table.id, recordId: "rec_1" });
    expect(outputs.record).toMatchObject({ id: "rec_1" });
  });

  test("data.delete-record simulates the deletion without writing", async () => {
    const { provider, writes } = stubData({ mode: "dry-run" });
    const outputs = await run(
      "data.delete-record",
      {
        tableId: table.id,
        target: "filter",
        filters: [{ column: "paid", operator: "equals", value: "false" }],
      },
      provider,
    );
    expect(outputs.record).toEqual({ ...record, simulated: true });
    expect(writes()).toEqual([]);
  });

  test("data.delete-record refuses a target nothing matches", async () => {
    const { provider, writes } = stubData({}, []);
    await expect(
      run("data.delete-record", { tableId: table.id, recordId: "rec_1" }, provider),
    ).rejects.toThrow("No record matched");
    expect(writes()).toEqual([]);
  });

  const checksummed = "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01";

  test("a filter matches an address written through the create path", async () => {
    const { provider, records } = storeData();
    await run(
      "data.create-record",
      {
        tableId: table.id,
        values: [
          { column: "title", value: "Rent" },
          { column: "wallet", value: checksummed },
        ],
      },
      provider,
    );
    expect(records[0]?.values.wallet).toBe(checksummed.toLowerCase());
    const outputs = await run(
      "data.find-records",
      {
        tableId: table.id,
        filters: [{ column: "wallet", operator: "equals", value: checksummed }],
      },
      provider,
    );
    expect(outputs.found).toMatchObject({ count: 1 });
  });

  test("a datetime filter matches the same instant written in another form", async () => {
    const { provider, records } = storeData();
    await run(
      "data.create-record",
      {
        tableId: table.id,
        values: [
          { column: "title", value: "Rent" },
          { column: "due", value: "2026-09-08T10:00:00Z" },
        ],
      },
      provider,
    );
    expect(records[0]?.values.due).toBe("2026-09-08T10:00:00.000Z");
    const outputs = await run(
      "data.find-records",
      {
        tableId: table.id,
        filters: [{ column: "due", operator: "equals", value: "2026-09-08T12:00:00+02:00" }],
      },
      provider,
    );
    expect(outputs.found).toMatchObject({ count: 1 });
  });

  test("data.update-record resolves a record by an address filter", async () => {
    const { provider, records } = storeData();
    await run(
      "data.create-record",
      {
        tableId: table.id,
        values: [
          { column: "title", value: "Rent" },
          { column: "wallet", value: checksummed },
        ],
      },
      provider,
    );
    await run(
      "data.update-record",
      {
        tableId: table.id,
        target: "filter",
        filters: [{ column: "wallet", operator: "equals", value: checksummed }],
        values: [{ column: "amount", value: "900" }],
      },
      provider,
    );
    expect(records[0]?.values.amount).toBe(900);
  });

  test("an is_empty filter carries its value through untouched", async () => {
    const { provider, calls } = stubData();
    await run(
      "data.find-records",
      { tableId: table.id, filters: [{ column: "due", operator: "is_empty", value: "" }] },
      provider,
    );
    expect(calls.at(-1)).toMatchObject({
      query: { filters: [{ column: "due", operator: "is_empty", value: "" }] },
    });
  });

  test("data.update-record updates a record written before a required column existed", async () => {
    const { provider, calls } = stubData({
      async table() {
        return withStatus;
      },
    });
    await run(
      "data.update-record",
      { tableId: table.id, recordId: "rec_1", values: [{ column: "amount", value: "900" }] },
      provider,
    );
    expect(calls.at(-1)).toEqual({
      name: "update",
      tableId: table.id,
      recordId: "rec_1",
      values: { title: "Rent", amount: 900, paid: false },
    });
  });

  test("data.update-record still refuses to blank a required column", async () => {
    const { provider, writes } = stubData({
      async table() {
        return withStatus;
      },
    });
    await expect(
      run(
        "data.update-record",
        { tableId: table.id, recordId: "rec_1", values: [{ column: "status", value: "" }] },
        provider,
      ),
    ).rejects.toThrow('"Status" is required.');
    await expect(
      run(
        "data.update-record",
        { tableId: table.id, recordId: "rec_1", values: [{ column: "title", value: "" }] },
        provider,
      ),
    ).rejects.toThrow('"Title" is required.');
    expect(writes()).toEqual([]);
  });

  test("data.update-record still refuses an unknown column", async () => {
    const { provider, writes } = stubData({
      async table() {
        return withStatus;
      },
    });
    await expect(
      run(
        "data.update-record",
        { tableId: table.id, recordId: "rec_1", values: [{ column: "nope", value: "x" }] },
        provider,
      ),
    ).rejects.toThrow('Table "Invoices" has no "nope" column');
    expect(writes()).toEqual([]);
  });

  test("a filter refuses an operator its column type does not support", async () => {
    const { provider, calls } = stubData();
    await expect(
      run(
        "data.find-records",
        {
          tableId: table.id,
          filters: [{ column: "paid", operator: "contains", value: "yes" }],
        },
        provider,
      ),
    ).rejects.toThrow('"Paid" cannot be filtered with "contains".');
    expect(calls.some((call) => call.name === "find")).toBe(false);
  });

  test("a text column still filters with contains", async () => {
    const { provider, calls } = stubData();
    const outputs = await run(
      "data.find-records",
      { tableId: table.id, filters: [{ column: "title", operator: "contains", value: "Rent" }] },
      provider,
    );
    expect(calls.at(-1)).toMatchObject({
      query: { filters: [{ column: "title", operator: "contains", value: "Rent" }] },
    });
    expect(outputs.found).toMatchObject({ count: 1 });
  });

  test("data.update-record refuses an unsupported filter operator instead of matching nothing", async () => {
    const { provider, calls, writes } = stubData();
    await expect(
      run(
        "data.update-record",
        {
          tableId: table.id,
          target: "filter",
          filters: [{ column: "wallet", operator: "contains", value: checksummed }],
          values: [{ column: "amount", value: "900" }],
        },
        provider,
      ),
    ).rejects.toThrow('"Wallet" cannot be filtered with "contains".');
    expect(calls.some((call) => call.name === "resolve")).toBe(false);
    expect(writes()).toEqual([]);
  });
});
