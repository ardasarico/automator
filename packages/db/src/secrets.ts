import type { SecretSummary } from "@automator/contracts";
import type { SQL } from "bun";

/**
 * Per-user secrets. The store only ever handles ciphertext: the API encrypts before `put`
 * and decrypts after `read`, so a database dump holds no usable values.
 */
export function createSecretStore(sql: SQL | undefined) {
  function connection() {
    if (!sql) throw new Error("Database is not configured");
    return sql;
  }
  type Row = { name: string; createdAt: Date; updatedAt: Date };
  const toSummary = (row: Row): SecretSummary => ({
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
  return {
    async list(ownerId: string): Promise<SecretSummary[]> {
      const db = connection();
      const rows = await db<Row[]>`
        SELECT name, created_at AS "createdAt", updated_at AS "updatedAt"
        FROM automator_secrets WHERE owner_id = ${ownerId} ORDER BY name`;
      return rows.map(toSummary);
    },
    async put(ownerId: string, name: string, ciphertext: string): Promise<SecretSummary> {
      const db = connection();
      const rows = await db<Row[]>`
        INSERT INTO automator_secrets (owner_id, name, value_encrypted)
        VALUES (${ownerId}, ${name}, ${ciphertext})
        ON CONFLICT (owner_id, name) DO UPDATE
          SET value_encrypted = EXCLUDED.value_encrypted, updated_at = now()
        RETURNING name, created_at AS "createdAt", updated_at AS "updatedAt"`;
      if (!rows[0]) throw new Error("Secret write failed");
      return toSummary(rows[0]);
    },
    /** True when a row was removed. */
    async remove(ownerId: string, name: string): Promise<boolean> {
      const db = connection();
      const rows = await db<{ name: string }[]>`
        DELETE FROM automator_secrets WHERE owner_id = ${ownerId} AND name = ${name} RETURNING name`;
      return rows.length > 0;
    },
    /** Ciphertext by name for the names that exist; absent names are simply missing. */
    async read(ownerId: string, names: readonly string[]): Promise<Record<string, string>> {
      if (names.length === 0) return {};
      const db = connection();
      // Bun SQL expands `sql(array)` into a parenthesised list for IN.
      const rows = await db<{ name: string; value: string }[]>`
        SELECT name, value_encrypted AS value FROM automator_secrets
        WHERE owner_id = ${ownerId} AND name IN ${db([...names])}`;
      return Object.fromEntries(rows.map((row) => [row.name, row.value]));
    },
  };
}
export type SecretStore = ReturnType<typeof createSecretStore>;
