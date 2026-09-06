import { describe, expect, test } from "bun:test";
import type { SQL } from "bun";
import { migrate, migrations, type Migration } from "./migrations";

/**
 * Stands in for a Postgres connection: records every statement and keeps the
 * ledger in memory, so ordering and "apply once" can be asserted without a server.
 */
function fakeSql() {
  const statements: string[] = [];
  const ledger = new Set<string>();

  const tagged = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").trim();
    statements.push(text);
    if (text.startsWith("SELECT name FROM automator_migrations"))
      return Promise.resolve([...ledger].map((name) => ({ name })));
    if (text.startsWith("INSERT INTO automator_migrations")) ledger.add(String(values[0]));
    return Promise.resolve([]);
  };
  const tx = Object.assign(tagged, {
    unsafe: (text: string) => {
      statements.push(text.trim());
      return Promise.resolve([]);
    },
  });
  const sql = { begin: (run: (tx: unknown) => Promise<void>) => run(tx) } as unknown as SQL;
  return { sql, statements, ledger };
}

describe("migration ledger", () => {
  test("applies every entry once and records it", async () => {
    const { sql, statements, ledger } = fakeSql();
    const entries: Migration[] = [
      { name: "0001_a", sql: "CREATE TABLE a ()" },
      { name: "0002_b", sql: "CREATE TABLE b ()" },
    ];

    expect(await migrate(sql, entries)).toEqual(["0001_a", "0002_b"]);
    expect(statements.filter((s) => s.startsWith("CREATE TABLE a"))).toHaveLength(1);
    expect(statements.filter((s) => s.startsWith("CREATE TABLE b"))).toHaveLength(1);
    expect(ledger).toEqual(new Set(["0001_a", "0002_b"]));

    statements.length = 0;
    expect(await migrate(sql, entries)).toEqual([]);
    expect(statements.some((s) => s.startsWith("CREATE TABLE a"))).toBe(false);
    expect(statements.some((s) => s.startsWith("CREATE TABLE b"))).toBe(false);
  });

  test("applies pending entries in order and skips the applied ones", async () => {
    const { sql, statements } = fakeSql();
    const first: Migration[] = [{ name: "0001_a", sql: "CREATE TABLE a ()" }];
    await migrate(sql, first);

    statements.length = 0;
    const both = [...first, { name: "0002_b", sql: "CREATE TABLE b ()" }];
    expect(await migrate(sql, both)).toEqual(["0002_b"]);
    expect(
      statements.filter((s) => s.startsWith("CREATE TABLE") && !s.includes("automator_migrations")),
    ).toEqual(["CREATE TABLE b ()"]);
  });

  test("takes the advisory lock and creates the ledger before reading it", async () => {
    const { sql, statements } = fakeSql();
    await migrate(sql, [{ name: "0001_a", sql: "CREATE TABLE a ()" }]);
    const lock = statements.findIndex((s) => s.includes("pg_advisory_xact_lock"));
    const ledgerTable = statements.findIndex((s) =>
      s.includes("CREATE TABLE IF NOT EXISTS automator_migrations"),
    );
    const read = statements.findIndex((s) => s.startsWith("SELECT name FROM automator_migrations"));
    expect(lock).toBe(0);
    expect(ledgerTable).toBeLessThan(read);
  });

  test("the shipped migrations have unique, ordered names", () => {
    const names = migrations.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual(names);
    expect(names[0]).toBe("0001_users");
  });
});
