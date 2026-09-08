import { describe, expect, test } from "bun:test";
import type { DataRecord, DataTable } from "@automator/contracts";
import { createDataFactory } from "./provider";

const table: DataTable = {
  id: "tbl-1",
  name: "Signups",
  columns: [{ id: "email", name: "Email", type: "text", required: true }],
  recordCount: 1,
  createdAt: "2026-09-08T00:00:00.000Z",
  updatedAt: "2026-09-08T00:00:00.000Z",
};

const record: DataRecord = {
  id: "rec-1",
  tableId: "tbl-1",
  values: { email: "a@b.co" },
  createdAt: "2026-09-08T00:00:00.000Z",
  updatedAt: "2026-09-08T00:00:00.000Z",
};

/** Every store call records its owner, so the tests can prove the provider never widens it. */
function stores() {
  const calls: { method: string; ownerId: string; args: unknown[] }[] = [];
  const owned = (ownerId: string) => ownerId === "alice";
  const note = (method: string, ownerId: string, ...args: unknown[]) => {
    calls.push({ method, ownerId, args });
  };
  const dataTables = {
    get: async (ownerId: string, id: string) => {
      note("get", ownerId, id);
      return owned(ownerId) && id === table.id ? table : null;
    },
  };
  const dataRecords = {
    get: async (ownerId: string, tableId: string, id: string) => {
      note("records.get", ownerId, tableId, id);
      return owned(ownerId) && id === record.id ? record : null;
    },
    find: async (ownerId: string, tableId: string, query: unknown = {}) => {
      note("records.find", ownerId, tableId, query);
      return owned(ownerId) ? [record] : [];
    },
    create: async (ownerId: string, tableId: string, values: Record<string, unknown>) => {
      note("records.create", ownerId, tableId, values);
      return owned(ownerId) && tableId === table.id ? { ...record, values } : null;
    },
    update: async (
      ownerId: string,
      tableId: string,
      id: string,
      values: Record<string, unknown>,
    ) => {
      note("records.update", ownerId, tableId, id, values);
      return owned(ownerId) && id === record.id ? { ...record, values } : null;
    },
    remove: async (ownerId: string, tableId: string, id: string) => {
      note("records.remove", ownerId, tableId, id);
      return owned(ownerId) && id === record.id ? record : null;
    },
  };
  return { calls, factory: createDataFactory({ dataTables, dataRecords }) };
}

describe("createDataFactory", () => {
  test("every call carries the owner it was built for", async () => {
    const { calls, factory } = stores();
    const provider = factory.forOwner("alice", "live");
    await provider.table("tbl-1");
    await provider.find("tbl-1", { limit: 5 });
    await provider.create("tbl-1", { email: "a@b.co" });
    await provider.update("tbl-1", "rec-1", { email: "c@d.co" });
    await provider.remove("tbl-1", "rec-1");
    expect(calls.map((call) => call.ownerId)).toEqual([
      "alice",
      "alice",
      "alice",
      "alice",
      "alice",
    ]);
  });

  test("another account's table resolves to nothing", async () => {
    const { factory } = stores();
    const provider = factory.forOwner("mallory", "live");
    expect(await provider.table("tbl-1")).toBeNull();
    expect(await provider.find("tbl-1", {})).toEqual([]);
    expect(await provider.resolve("tbl-1", { recordId: "rec-1" })).toBeNull();
    expect(await provider.remove("tbl-1", "rec-1")).toBeNull();
    await expect(provider.create("tbl-1", {})).rejects.toThrow('Table "tbl-1" was not found');
    await expect(provider.update("tbl-1", "rec-1", {})).rejects.toThrow(
      'Record "rec-1" was not found',
    );
  });

  test("a target resolves by record id or by the first match of its query", async () => {
    const { calls, factory } = stores();
    const provider = factory.forOwner("alice", "live");
    expect(await provider.resolve("tbl-1", { recordId: "rec-1" })).toEqual(record);
    expect(await provider.resolve("tbl-1", { recordId: "rec-9" })).toBeNull();
    expect(
      await provider.resolve("tbl-1", {
        query: { filters: [{ column: "email", operator: "equals", value: "a@b.co" }], limit: 25 },
      }),
    ).toEqual(record);
    // Only the first match is needed, whatever limit the node asked for.
    expect(calls.at(-1)).toMatchObject({
      method: "records.find",
      args: [
        "tbl-1",
        { filters: [{ column: "email", operator: "equals", value: "a@b.co" }], limit: 1 },
      ],
    });
  });

  test("a simulated run reads but never writes", async () => {
    const { calls, factory } = stores();
    const provider = factory.forOwner("alice", "dry-run");
    expect(provider.mode).toBe("dry-run");
    expect(await provider.table("tbl-1")).toEqual(table);
    expect(await provider.find("tbl-1", {})).toEqual([record]);
    await expect(provider.create("tbl-1", {})).rejects.toThrow(
      "A simulated run cannot create a record",
    );
    await expect(provider.update("tbl-1", "rec-1", {})).rejects.toThrow(
      "A simulated run cannot change a record",
    );
    await expect(provider.remove("tbl-1", "rec-1")).rejects.toThrow(
      "A simulated run cannot delete a record",
    );
    expect(calls.map((call) => call.method)).toEqual(["get", "records.find"]);
  });
});
