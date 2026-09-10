import type { SQL } from "bun";

export interface Migration {
  name: string;
  sql: string;
}

/* Never edit released migrations: the ledger skips entries already applied. */
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
  {
    name: "0007_event_cursors",
    sql: `CREATE TABLE IF NOT EXISTS automator_event_cursors (
      flow_id TEXT NOT NULL REFERENCES automator_flows(id) ON DELETE CASCADE,
      node_id TEXT NOT NULL,
      chain_id INTEGER NOT NULL,
      last_block BIGINT NOT NULL CHECK (last_block >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (flow_id, node_id)
    );
    ALTER TABLE automator_runs DROP CONSTRAINT IF EXISTS automator_runs_source_check;
    ALTER TABLE automator_runs ADD CONSTRAINT automator_runs_source_check
      CHECK (source IN ('manual', 'webhook', 'schedule', 'miniapp', 'event'))`,
  },
  {
    name: "0008_retire_selfie_check",
    sql: `UPDATE automator_flows SET document = jsonb_set(document, '{nodes}', (
      SELECT jsonb_agg(
        CASE WHEN node->>'type' = 'world.selfie-check'
          THEN jsonb_set(node, '{type}', '"world.id-verify"') ELSE node END
        ORDER BY ordinality)
      FROM jsonb_array_elements(document->'nodes') WITH ORDINALITY AS nodes(node, ordinality)))
    WHERE document->'nodes' @> '[{"type":"world.selfie-check"}]';
    UPDATE automator_listings SET document = jsonb_set(document, '{nodes}', (
      SELECT jsonb_agg(
        CASE WHEN node->>'type' = 'world.selfie-check'
          THEN jsonb_set(node, '{type}', '"world.id-verify"') ELSE node END
        ORDER BY ordinality)
      FROM jsonb_array_elements(document->'nodes') WITH ORDINALITY AS nodes(node, ordinality)))
    WHERE document->'nodes' @> '[{"type":"world.selfie-check"}]';
    UPDATE automator_runs SET document = jsonb_set(document, '{nodes}', (
      SELECT jsonb_agg(
        CASE WHEN node->>'type' = 'world.selfie-check'
          THEN jsonb_set(node, '{type}', '"world.id-verify"') ELSE node END
        ORDER BY ordinality)
      FROM jsonb_array_elements(document->'nodes') WITH ORDINALITY AS nodes(node, ordinality)))
    WHERE document->'nodes' @> '[{"type":"world.selfie-check"}]';
    UPDATE automator_listings SET node_types = (
      SELECT coalesce(jsonb_agg(to_jsonb(type) ORDER BY ordinality), '[]'::jsonb)
      FROM (
        SELECT DISTINCT ON (type) type, ordinality
        FROM (
          SELECT CASE WHEN type = 'world.selfie-check' THEN 'world.id-verify' ELSE type END AS type,
            ordinality
          FROM jsonb_array_elements_text(node_types) WITH ORDINALITY AS types(type, ordinality)
        ) renamed
        ORDER BY type, ordinality
      ) distinct_types)
    WHERE node_types @> '["world.selfie-check"]'`,
  },
  {
    name: "0009_flow_versions",
    sql: `CREATE TABLE IF NOT EXISTS automator_flow_versions (
      id TEXT PRIMARY KEY,
      flow_id TEXT NOT NULL REFERENCES automator_flows(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL REFERENCES automator_users(id) ON DELETE CASCADE,
      number INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      document JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (flow_id, number)
    );
    CREATE INDEX IF NOT EXISTS automator_flow_versions_flow_number
      ON automator_flow_versions (flow_id, number DESC)`,
  },
  {
    name: "0010_watch_state",
    sql: `CREATE TABLE IF NOT EXISTS automator_watch_state (
      flow_id TEXT NOT NULL REFERENCES automator_flows(id) ON DELETE CASCADE,
      node_id TEXT NOT NULL,
      met BOOLEAN NOT NULL,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (flow_id, node_id)
    );
    ALTER TABLE automator_runs DROP CONSTRAINT IF EXISTS automator_runs_source_check;
    ALTER TABLE automator_runs ADD CONSTRAINT automator_runs_source_check
      CHECK (source IN ('manual', 'webhook', 'schedule', 'miniapp', 'event', 'watch'))`,
  },
  {
    name: "0011_session_world_request",
    sql: `ALTER TABLE automator_sessions
      ADD COLUMN IF NOT EXISTS world_nonce TEXT,
      ADD COLUMN IF NOT EXISTS world_expires_at BIGINT`,
  },
  {
    name: "0012_durable_trigger_claims",
    sql: `ALTER TABLE automator_flows
      ADD COLUMN IF NOT EXISTS polling_revision TEXT NOT NULL DEFAULT '0';
    ALTER TABLE automator_watch_state
      ADD COLUMN IF NOT EXISTS observation_id TEXT NOT NULL DEFAULT gen_random_uuid()::text;
    CREATE TABLE IF NOT EXISTS automator_trigger_claims (
      id TEXT PRIMARY KEY,
      flow_id TEXT NOT NULL REFERENCES automator_flows(id) ON DELETE CASCADE,
      node_id TEXT NOT NULL,
      polling_revision TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('schedule', 'event', 'watch')),
      occurrence_key TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'uncertain')),
      started_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      run_record JSONB,
      history_saved BOOLEAN NOT NULL DEFAULT false,
      UNIQUE (flow_id, node_id, polling_revision, source, occurrence_key)
    );
    CREATE INDEX IF NOT EXISTS automator_trigger_claims_latest
      ON automator_trigger_claims (flow_id, node_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS automator_trigger_claims_unresolved
      ON automator_trigger_claims (flow_id, node_id)
      WHERE status IN ('running', 'uncertain')`,
  },
  {
    name: "0013_payment_policies",
    sql: `CREATE TABLE IF NOT EXISTS automator_payment_policies (
      owner_id TEXT PRIMARY KEY REFERENCES automator_users(id) ON DELETE CASCADE,
      policy JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS automator_payment_reservations (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES automator_users(id) ON DELETE CASCADE,
      chain_id INTEGER NOT NULL,
      asset TEXT NOT NULL CHECK (asset IN ('native', 'usdc')),
      recipient TEXT NOT NULL,
      amount NUMERIC(78, 0) NOT NULL CHECK (amount >= 0),
      day DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );
    CREATE INDEX IF NOT EXISTS automator_payment_reservations_daily
      ON automator_payment_reservations (owner_id, day, chain_id, asset)`,
  },
  {
    name: "0014_data_tables",
    sql: `CREATE TABLE IF NOT EXISTS automator_data_tables (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES automator_users(id) ON DELETE CASCADE,
      name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 64),
      description TEXT,
      columns JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS automator_data_records (
      id TEXT PRIMARY KEY,
      table_id TEXT NOT NULL REFERENCES automator_data_tables(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL REFERENCES automator_users(id) ON DELETE CASCADE,
      "values" JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS automator_data_tables_owner
      ON automator_data_tables (owner_id, created_at);
    CREATE INDEX IF NOT EXISTS automator_data_records_keyset
      ON automator_data_records (table_id, created_at DESC, id DESC)`,
  },
  {
    name: "0015_flow_app_publishing",
    sql: `ALTER TABLE automator_flows
      ADD COLUMN IF NOT EXISTS app_published BOOLEAN NOT NULL DEFAULT false;
    UPDATE automator_flows f SET app_published = true
      FROM automator_listings l WHERE l.flow_id = f.id AND NOT f.app_published`,
  },
  {
    name: "0016_node_presets",
    sql: `CREATE TABLE IF NOT EXISTS automator_node_presets (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES automator_users(id) ON DELETE CASCADE,
      name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 64),
      node_type TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      config JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS automator_node_presets_owner
      ON automator_node_presets (owner_id, created_at DESC, id DESC)`,
  },
  {
    name: "0017_api_keys",
    sql: `CREATE TABLE IF NOT EXISTS automator_api_keys (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES automator_users(id) ON DELETE CASCADE,
      name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
      key_hash TEXT NOT NULL UNIQUE,
      prefix TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS automator_api_keys_owner
      ON automator_api_keys (owner_id, created_at DESC, id DESC)`,
  },
  {
    /*
     * One row per USDC transfer a visitor made to answer a `usdc.payment` screen. The row is
     * written in the same transaction that claims the screen, so a transfer can answer exactly one
     * screen: (chain_id, tx_hash) is the spend. `run_id` names the run the screen paused in.
     */
    name: "0018_payments",
    sql: `CREATE TABLE IF NOT EXISTS automator_payments (
      id TEXT PRIMARY KEY,
      flow_id TEXT NOT NULL REFERENCES automator_flows(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL,
      run_id TEXT,
      chain_id INTEGER NOT NULL,
      tx_hash TEXT NOT NULL CHECK (tx_hash ~ '^0x[0-9a-f]{64}$'),
      from_address TEXT NOT NULL,
      to_address TEXT NOT NULL,
      amount_units NUMERIC(78, 0) NOT NULL CHECK (amount_units > 0),
      verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (chain_id, tx_hash)
    );
    CREATE INDEX IF NOT EXISTS automator_payments_session
      ON automator_payments (session_id);
    CREATE INDEX IF NOT EXISTS automator_payments_flow
      ON automator_payments (flow_id, created_at DESC)`,
  },
  {
    name: "0019_run_source_api",
    sql: `ALTER TABLE automator_runs DROP CONSTRAINT IF EXISTS automator_runs_source_check;
    ALTER TABLE automator_runs ADD CONSTRAINT automator_runs_source_check
      CHECK (source IN ('manual', 'webhook', 'schedule', 'miniapp', 'event', 'watch', 'api'))`,
  },
];

const LEDGER = `CREATE TABLE IF NOT EXISTS automator_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

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
