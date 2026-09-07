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
  {
    name: "0002_flows",
    sql: `CREATE TABLE IF NOT EXISTS automator_flows (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES automator_users(id) ON DELETE CASCADE,
      name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
      description TEXT NOT NULL DEFAULT '',
      document JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS automator_flows_owner_updated
      ON automator_flows (owner_id, updated_at DESC)`,
  },
  {
    name: "0003_listings",
    sql: `CREATE TABLE IF NOT EXISTS automator_listings (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 80),
      flow_id TEXT NOT NULL UNIQUE REFERENCES automator_flows(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL REFERENCES automator_users(id) ON DELETE CASCADE,
      name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
      description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 280),
      document JSONB NOT NULL,
      node_types JSONB NOT NULL DEFAULT '[]',
      fork_count INTEGER NOT NULL DEFAULT 0 CHECK (fork_count >= 0),
      published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS automator_listings_published
      ON automator_listings (published_at DESC)`,
  },
  {
    name: "0004_runs",
    sql: `CREATE TABLE IF NOT EXISTS automator_runs (
      id TEXT PRIMARY KEY,
      flow_id TEXT NOT NULL REFERENCES automator_flows(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL REFERENCES automator_users(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed', 'waiting')),
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      document JSONB NOT NULL,
      result JSONB NOT NULL,
      started_at TIMESTAMPTZ NOT NULL,
      finished_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS automator_runs_owner_started
      ON automator_runs (owner_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS automator_runs_flow_started
      ON automator_runs (flow_id, started_at DESC)`,
  },
  {
    name: "0005_flow_triggers",
    sql: `ALTER TABLE automator_flows
      ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS webhook_token TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '');
    CREATE UNIQUE INDEX IF NOT EXISTS automator_flows_webhook_token ON automator_flows (webhook_token);
    ALTER TABLE automator_runs
      ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual', 'webhook', 'schedule', 'miniapp'))`,
  },
  {
    name: "0006_secrets_sessions",
    sql: `CREATE TABLE IF NOT EXISTS automator_secrets (
      owner_id TEXT NOT NULL REFERENCES automator_users(id) ON DELETE CASCADE,
      name TEXT NOT NULL CHECK (name ~ '^[a-z][a-z0-9_]{0,63}$'),
      value_encrypted TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (owner_id, name)
    );
    CREATE TABLE IF NOT EXISTS automator_sessions (
      id TEXT PRIMARY KEY,
      flow_id TEXT NOT NULL REFERENCES automator_flows(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL REFERENCES automator_users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('screen', 'end', 'failed')),
      node_id TEXT,
      variables JSONB NOT NULL DEFAULT '{}'::jsonb,
      payload JSONB,
      last_run_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS automator_sessions_flow ON automator_sessions (flow_id, updated_at DESC)`,
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
