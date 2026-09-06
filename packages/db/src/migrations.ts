import type { SQL } from "bun";

export interface Migration {
  name: string;
  sql: string;
}

/**
 * Applied in order, exactly once each, and never edited afterwards: a released
 * entry is already recorded in the ledger, so a change to it would be skipped.
 */
export const migrations: Migration[] = [
  {
    name: "0001_users",
    sql: `CREATE TABLE IF NOT EXISTS automator_users (
      id TEXT PRIMARY KEY,
      name TEXT CHECK (name IS NULL OR (char_length(btrim(name)) BETWEEN 1 AND 60)),
      username TEXT UNIQUE CHECK (username IS NULL OR (username ~ '^[a-z][a-z0-9_]{2,23}$')),
      wallet_address TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  },
];

const LEDGER = `CREATE TABLE IF NOT EXISTS automator_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

/**
 * Runs pending migrations inside one transaction, behind an advisory lock so
 * that concurrently starting API instances serialize instead of racing.
 */
export async function migrate(sql: SQL, entries: Migration[] = migrations): Promise<string[]> {
  const applied: string[] = [];
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(716301, 1)`;
    await tx.unsafe(LEDGER);
    const rows = await tx<{ name: string }[]>`SELECT name FROM automator_migrations`;
    const done = new Set(rows.map((row) => row.name));
    for (const entry of entries) {
      if (done.has(entry.name)) continue;
      await tx.unsafe(entry.sql);
      await tx`INSERT INTO automator_migrations (name) VALUES (${entry.name})`;
      applied.push(entry.name);
    }
  });
  return applied;
}
