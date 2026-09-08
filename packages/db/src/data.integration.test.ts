import { dataColumnOperators, type DataColumn } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { SQL } from "bun";
import {
  assertRecordCapacity,
  createDataRecordStore,
  DataRecordCursorError,
  dataRecordLimit,
  dataRecordMaxBytes,
} from "./data-records";
import {
  createDataTableStore,
  DataColumnDuplicateError,
  DataColumnTypeLockedError,
  DataLimitError,
  dataTableLimit,
  DataTableOwnerMissingError,
} from "./data-tables";
import { migrate } from "./migrations";
import { createUserStore } from "./users";

const url = process.env.TEST_DATABASE_URL;

const columns: DataColumn[] = [
  { id: "title", name: "Title", type: "text", required: true },
  { id: "amount", name: "Amount", type: "number", required: false },
  { id: "done", name: "Done", type: "checkbox", required: false },
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

function connect() {
  return new SQL(url!, { max: 2, connectionTimeout: 5 });
}

async function reset(sql: SQL) {
  await migrate(sql);
  await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
  const users = createUserStore(sql);
  await users.sync("did:privy:test-a", "0xaaa");
  await users.sync("did:privy:test-b", null);
  return {
    tables: createDataTableStore(sql),
    records: createDataRecordStore(sql),
  };
}

describe.skipIf(!url)("live PostgreSQL data tables", () => {
  test.skipIf(!url)("stores tables and records per owner and cascades", async () => {
    const sql = connect();
    try {
      const { tables, records } = await reset(sql);

      const created = await tables.create("did:privy:test-a", {
        name: "Signups",
        description: "People who signed up.",
        columns,
      });
      expect(created).toMatchObject({
        name: "Signups",
        description: "People who signed up.",
        columns,
        recordCount: 0,
      });
      expect(Date.parse(created.createdAt)).not.toBeNaN();

      expect(await tables.get("did:privy:test-a", created.id)).toEqual(created);
      expect(await tables.get("did:privy:test-b", created.id)).toBeNull();
      expect(await tables.list("did:privy:test-b")).toEqual([]);
      expect(await tables.list("did:privy:test-a")).toEqual([created]);

      const values = {
        title: "Ada",
        amount: 12,
        done: true,
        due: "2026-09-08T10:00:00.000Z",
        status: "open",
        wallet: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
      };
      const record = await records.create("did:privy:test-a", created.id, values);
      expect(record).toMatchObject({ tableId: created.id, values });
      // A table that belongs to somebody else resolves to nothing, never to a write.
      expect(await records.create("did:privy:test-b", created.id, values)).toBeNull();
      expect(await records.get("did:privy:test-b", created.id, record!.id)).toBeNull();
      expect(await records.get("did:privy:test-a", created.id, record!.id)).toEqual(record!);
      expect(await records.list("did:privy:test-b", created.id)).toEqual({
        records: [],
      });
      expect(await records.list("did:privy:test-a", created.id)).toEqual({
        records: [record!],
      });
      expect((await tables.get("did:privy:test-a", created.id))?.recordCount).toBe(1);

      const updated = await records.update("did:privy:test-a", created.id, record!.id, {
        ...values,
        title: "Grace",
      });
      expect(updated?.values).toMatchObject({ title: "Grace", amount: 12 });
      expect(updated?.createdAt).toBe(record!.createdAt);
      expect(await records.update("did:privy:test-b", created.id, record!.id, values)).toBeNull();

      const second = await records.create("did:privy:test-a", created.id, {
        title: "Linus",
      });
      expect(await records.remove("did:privy:test-b", created.id, second!.id)).toBeNull();
      expect((await records.remove("did:privy:test-a", created.id, second!.id))?.id).toBe(
        second!.id,
      );
      expect(await records.get("did:privy:test-a", created.id, second!.id)).toBeNull();

      // Deleting the table cascades to its records.
      expect(await tables.remove("did:privy:test-b", created.id)).toBe(false);
      expect(await tables.remove("did:privy:test-a", created.id)).toBe(true);
      const left = await sql<
        { count: number }[]
      >`SELECT COUNT(*)::int AS count FROM automator_data_records WHERE table_id = ${created.id}`;
      expect(left[0]!.count).toBe(0);

      // Deleting the user cascades to both tables.
      const survivor = await tables.create("did:privy:test-a", {
        name: "Kept",
        columns,
      });
      await records.create("did:privy:test-a", survivor.id, { title: "Ada" });
      await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
      expect(await tables.list("did:privy:test-a")).toEqual([]);
      const orphans = await sql<
        { count: number }[]
      >`SELECT COUNT(*)::int AS count FROM automator_data_records WHERE table_id = ${survivor.id}`;
      expect(orphans[0]!.count).toBe(0);

      await expect(
        tables.create("did:privy:test-missing", { name: "Nope", columns }),
      ).rejects.toBeInstanceOf(DataTableOwnerMissingError);
    } finally {
      await sql.close({ timeout: 5 });
    }
  });

  test.skipIf(!url)("pages records by keyset without overlap or gaps", async () => {
    const sql = connect();
    try {
      const { tables, records } = await reset(sql);
      const table = await tables.create("did:privy:test-a", {
        name: "Pager",
        columns,
      });

      const ids: string[] = [];
      for (let index = 0; index < 7; index += 1) {
        const record = await records.create("did:privy:test-a", table.id, {
          title: `Row ${index}`,
        });
        ids.push(record!.id);
      }
      // Force ties on created_at so the id tiebreaker is exercised.
      const instants = [
        "2026-09-08T10:00:00.000Z",
        "2026-09-08T10:00:00.000Z",
        "2026-09-08T10:00:00.000Z",
        "2026-09-08T10:00:01.000Z",
        "2026-09-08T10:00:01.000Z",
        "2026-09-08T10:00:02.000Z",
        "2026-09-08T10:00:02.000Z",
      ];
      for (const [index, id] of ids.entries())
        await sql`UPDATE automator_data_records SET created_at = ${instants[index]!}::timestamptz
          WHERE id = ${id}`;

      const first = await records.list("did:privy:test-a", table.id, {
        limit: 3,
      });
      expect(first.records).toHaveLength(3);
      expect(first.nextCursor).toBeString();
      const second = await records.list("did:privy:test-a", table.id, {
        limit: 3,
        cursor: first.nextCursor,
      });
      expect(second.records).toHaveLength(3);
      const third = await records.list("did:privy:test-a", table.id, {
        limit: 3,
        cursor: second.nextCursor,
      });
      expect(third.records).toHaveLength(1);
      expect(third.nextCursor).toBeUndefined();

      const everything = await records.list("did:privy:test-a", table.id, {
        limit: 100,
      });
      expect(everything.nextCursor).toBeUndefined();
      const walked = [...first.records, ...second.records, ...third.records];
      expect(walked.map((entry) => entry.id)).toEqual(everything.records.map((entry) => entry.id));
      expect(new Set(walked.map((entry) => entry.id)).size).toBe(ids.length);
      for (let index = 1; index < walked.length; index += 1) {
        const previous = walked[index - 1]!;
        const current = walked[index]!;
        const order = Date.parse(current.createdAt) - Date.parse(previous.createdAt);
        expect(order < 0 || (order === 0 && current.id < previous.id)).toBe(true);
      }

      await expect(
        records.list("did:privy:test-a", table.id, {
          cursor: "not-a-cursor",
        }),
      ).rejects.toBeInstanceOf(DataRecordCursorError);

      await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
    } finally {
      await sql.close({ timeout: 5 });
    }
  });

  test.skipIf(!url)("filters with every supported operator and sorts both ways", async () => {
    const sql = connect();
    try {
      const { tables, records } = await reset(sql);
      const table = await tables.create("did:privy:test-a", {
        name: "Finder",
        columns,
      });

      const rows = [
        {
          title: "Ada Lovelace",
          amount: 12,
          done: true,
          due: "2026-09-08T10:00:00.000Z",
          status: "open",
          wallet: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
        },
        {
          title: "Grace Hopper",
          amount: 4,
          done: false,
          due: "2026-01-01T00:00:00.000Z",
          status: "closed",
        },
        { title: "Linus" },
      ];
      for (const values of rows) await records.create("did:privy:test-a", table.id, values);
      const titles = async (query: Parameters<typeof records.find>[2]) =>
        (await records.find("did:privy:test-a", table.id, query))
          .map((record) => String(record.values.title))
          .sort();

      // Every operator the contract offers for at least one column type.
      const covered = new Set(Object.values(dataColumnOperators).flat());
      expect([...covered].sort()).toEqual(
        ["contains", "equals", "greater_than", "is_empty", "is_not_empty", "less_than", "not_equals"], // prettier-ignore
      );

      expect(
        await titles({
          filters: [{ column: "status", operator: "equals", value: "open" }],
        }),
      ).toEqual(["Ada Lovelace"]);
      expect(
        await titles({
          filters: [{ column: "done", operator: "equals", value: "true" }],
        }),
      ).toEqual(["Ada Lovelace"]);
      expect(
        await titles({
          filters: [
            {
              column: "wallet",
              operator: "equals",
              value: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
            },
          ],
        }),
      ).toEqual(["Ada Lovelace"]);
      // `not_equals` also matches records that have no value at all.
      expect(
        await titles({
          filters: [{ column: "status", operator: "not_equals", value: "open" }],
        }),
      ).toEqual(["Grace Hopper", "Linus"]);
      expect(
        await titles({
          filters: [{ column: "title", operator: "contains", value: "ACE" }],
        }),
      ).toEqual(["Ada Lovelace", "Grace Hopper"]);
      expect(
        await titles({
          filters: [{ column: "amount", operator: "greater_than", value: "9" }],
        }),
      ).toEqual(["Ada Lovelace"]);
      expect(
        await titles({
          filters: [{ column: "amount", operator: "less_than", value: "9" }],
        }),
      ).toEqual(["Grace Hopper"]);
      expect(
        await titles({
          filters: [
            {
              column: "due",
              operator: "greater_than",
              value: "2026-06-01T00:00:00.000Z",
            },
          ],
        }),
      ).toEqual(["Ada Lovelace"]);
      expect(
        await titles({
          filters: [
            {
              column: "due",
              operator: "less_than",
              value: "2026-06-01T00:00:00.000Z",
            },
          ],
        }),
      ).toEqual(["Grace Hopper"]);
      expect(
        await titles({
          filters: [{ column: "wallet", operator: "is_empty" }],
        }),
      ).toEqual(["Grace Hopper", "Linus"]);
      expect(
        await titles({
          filters: [{ column: "wallet", operator: "is_not_empty" }],
        }),
      ).toEqual(["Ada Lovelace"]);
      // Filters combine with AND.
      expect(
        await titles({
          filters: [
            { column: "title", operator: "contains", value: "a" },
            { column: "amount", operator: "less_than", value: "9" },
          ],
        }),
      ).toEqual(["Grace Hopper"]);

      const ascending = await records.find("did:privy:test-a", table.id, {
        sort: { column: "title", direction: "asc" },
      });
      expect(ascending.map((record) => record.values.title)).toEqual([
        "Ada Lovelace",
        "Grace Hopper",
        "Linus",
      ]);
      const descending = await records.find("did:privy:test-a", table.id, {
        sort: { column: "title", direction: "desc" },
      });
      expect(descending.map((record) => record.values.title)).toEqual([
        "Linus",
        "Grace Hopper",
        "Ada Lovelace",
      ]);
      expect(await records.find("did:privy:test-a", table.id, { limit: 2 })).toHaveLength(2);
      expect(await records.find("did:privy:test-b", table.id, {})).toEqual([]);

      await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
    } finally {
      await sql.close({ timeout: 5 });
    }
  });

  test.skipIf(!url)("compares numerically only when both sides are numbers", async () => {
    const sql = connect();
    try {
      const { tables, records } = await reset(sql);
      const table = await tables.create("did:privy:test-a", {
        name: "Mixed",
        columns: [{ id: "code", name: "Code", type: "text", required: false }],
      });
      for (const code of ["1", "20", "three"])
        await records.create("did:privy:test-a", table.id, { code });
      await records.create("did:privy:test-a", table.id, {});

      const codes = async (operator: "greater_than" | "less_than") =>
        (
          await records.find("did:privy:test-a", table.id, {
            filters: [{ column: "code", operator, value: "9" }],
          })
        )
          .map((record) => String(record.values.code))
          .sort();

      // "20" beats "9" only numerically; "three" beats it lexically; the blank row matches neither.
      expect(await codes("greater_than")).toEqual(["20", "three"]);
      expect(await codes("less_than")).toEqual(["1"]);

      await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
    } finally {
      await sql.close({ timeout: 5 });
    }
  });

  test.skipIf(!url)("enforces the caps and the column rules", async () => {
    const sql = connect();
    try {
      const { tables, records } = await reset(sql);

      // Fill the per-owner cap directly; the store only has to refuse the next one.
      for (let index = 0; index < dataTableLimit; index += 1)
        await sql`INSERT INTO automator_data_tables (id, owner_id, name, columns)
          VALUES (${crypto.randomUUID()}, 'did:privy:test-a', ${`Table ${index}`}, '[]'::jsonb)`;
      await expect(
        tables.create("did:privy:test-a", { name: "One too many", columns }),
      ).rejects.toBeInstanceOf(DataLimitError);
      // The cap is per owner, so the other account is unaffected.
      await tables.create("did:privy:test-b", { name: "Fine", columns });

      await sql`DELETE FROM automator_data_tables WHERE owner_id = 'did:privy:test-a'`;

      const tooMany = Array.from({ length: 51 }, (_, index) => ({
        id: `c${index}`,
        name: `Column ${index}`,
        type: "text" as const,
        required: false,
      }));
      await expect(
        tables.create("did:privy:test-a", { name: "Wide", columns: tooMany }),
      ).rejects.toBeInstanceOf(DataLimitError);
      await expect(
        tables.create("did:privy:test-a", {
          name: "Twins",
          columns: [columns[0]!, { ...columns[0]! }],
        }),
      ).rejects.toBeInstanceOf(DataColumnDuplicateError);

      const table = await tables.create("did:privy:test-a", {
        name: "Rules",
        columns,
      });
      const retyped = columns.map((column) =>
        column.id === "amount" ? { ...column, type: "text" as const } : column,
      );
      // With no records the type is still free to change.
      expect(
        (
          await tables.update("did:privy:test-a", table.id, {
            name: "Rules",
            columns: retyped,
          })
        )?.columns,
      ).toEqual(retyped);
      await tables.update("did:privy:test-a", table.id, {
        name: "Rules",
        columns,
      });

      await records.create("did:privy:test-a", table.id, {
        title: "Ada",
        amount: 3,
      });
      await expect(
        tables.update("did:privy:test-a", table.id, {
          name: "Rules",
          columns: retyped,
        }),
      ).rejects.toBeInstanceOf(DataColumnTypeLockedError);

      // Dropping a column leaves the stored values alone, so re-adding it shows them again.
      const trimmed = columns.filter((column) => column.id !== "amount");
      const shrunk = await tables.update("did:privy:test-a", table.id, {
        name: "Rules",
        columns: trimmed,
      });
      expect(shrunk).toMatchObject({ columns: trimmed, recordCount: 1 });
      const kept = await records.list("did:privy:test-a", table.id);
      expect(kept.records[0]?.values).toEqual({ title: "Ada", amount: 3 });
      const restored = await tables.update("did:privy:test-a", table.id, {
        name: "Rules",
        columns,
      });
      expect(restored?.columns).toEqual(columns);
      expect((await records.list("did:privy:test-a", table.id)).records[0]?.values).toEqual({
        title: "Ada",
        amount: 3,
      });

      // Re-adding a dropped column under another type would reopen the lock, so it is refused.
      await tables.update("did:privy:test-a", table.id, { name: "Rules", columns: trimmed });
      await expect(
        tables.update("did:privy:test-a", table.id, { name: "Rules", columns: retyped }),
      ).rejects.toBeInstanceOf(DataColumnTypeLockedError);
      await tables.update("did:privy:test-a", table.id, { name: "Rules", columns });

      // No record holds a "due" value, so that column may come back with any type.
      const withoutDue = columns.filter((column) => column.id !== "due");
      await tables.update("did:privy:test-a", table.id, { name: "Rules", columns: withoutDue });
      const dueAsText = columns.map((column) =>
        column.id === "due" ? { ...column, type: "text" as const } : column,
      );
      expect(
        (
          await tables.update("did:privy:test-a", table.id, {
            name: "Rules",
            columns: dueAsText,
          })
        )?.columns,
      ).toEqual(dueAsText);

      await expect(
        records.create("did:privy:test-a", table.id, {
          title: "x".repeat(dataRecordMaxBytes),
        }),
      ).rejects.toBeInstanceOf(DataLimitError);
      await expect(
        records.update("did:privy:test-a", table.id, kept.records[0]!.id, {
          title: "x".repeat(dataRecordMaxBytes),
        }),
      ).rejects.toBeInstanceOf(DataLimitError);
      expect(
        await tables.update("did:privy:test-b", table.id, {
          name: "Theirs",
          columns,
        }),
      ).toBeNull();

      await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
    } finally {
      await sql.close({ timeout: 5 });
    }
  });
});

test("refuses a record once the table is at its cap", () => {
  expect(() => assertRecordCapacity(dataRecordLimit - 1)).not.toThrow();
  expect(() => assertRecordCapacity(dataRecordLimit)).toThrow(DataLimitError);
});

test.skipIf(Boolean(url))("live database tests need TEST_DATABASE_URL", () => {
  console.log("Skipping packages/db data integration tests: TEST_DATABASE_URL is not set.");
  expect(url).toBeUndefined();
});
