import { apiKeyLimit, type ApiKeySummary } from "@automator/contracts";
import type { SQL } from "bun";

export { apiKeyLimit };

export class ApiKeyLimitError extends Error {
  constructor() {
    super(`An account can hold at most ${apiKeyLimit} API keys.`);
    this.name = "ApiKeyLimitError";
  }
}

type Row = { id: string; name: string; prefix: string; createdAt: Date; lastUsedAt: Date | null };

function toSummary(row: Row): ApiKeySummary {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.createdAt.toISOString(),
    ...(row.lastUsedAt ? { lastUsedAt: row.lastUsedAt.toISOString() } : {}),
  };
}

const columns = `id, name, prefix, created_at AS "createdAt", last_used_at AS "lastUsedAt"`;

export function createApiKeyStore(sql: SQL | undefined) {
  function connection() {
    if (!sql) throw new Error("Database is not configured");
    return sql;
  }
  return {
    async list(ownerId: string): Promise<ApiKeySummary[]> {
      const db = connection();
      const rows = await db<Row[]>`
        SELECT ${db.unsafe(columns)} FROM automator_api_keys
        WHERE owner_id = ${ownerId} AND revoked_at IS NULL
        ORDER BY created_at DESC, id DESC`;
      return rows.map(toSummary);
    },
    async create(
      ownerId: string,
      name: string,
      keyHash: string,
      prefix: string,
    ): Promise<ApiKeySummary> {
      const db = connection();
      // One statement so two parallel creations cannot both see room for the last key.
      const rows = await db<Row[]>`
        INSERT INTO automator_api_keys (id, owner_id, name, key_hash, prefix)
        SELECT ${crypto.randomUUID()}, ${ownerId}, ${name}, ${keyHash}, ${prefix}
        WHERE (
          SELECT count(*) FROM automator_api_keys
          WHERE owner_id = ${ownerId} AND revoked_at IS NULL
        ) < ${apiKeyLimit}
        RETURNING ${db.unsafe(columns)}`;
      if (!rows[0]) throw new ApiKeyLimitError();
      return toSummary(rows[0]);
    },
    async revoke(ownerId: string, id: string): Promise<boolean> {
      const db = connection();
      const rows = await db<{ id: string }[]>`
        UPDATE automator_api_keys SET revoked_at = now()
        WHERE id = ${id} AND owner_id = ${ownerId} AND revoked_at IS NULL
        RETURNING id`;
      return rows.length > 0;
    },
    /** The key's owner, or null when the hash matches nothing live. */
    async findOwner(keyHash: string): Promise<{ id: string; ownerId: string } | null> {
      const db = connection();
      const rows = await db<{ id: string; ownerId: string }[]>`
        SELECT id, owner_id AS "ownerId" FROM automator_api_keys
        WHERE key_hash = ${keyHash} AND revoked_at IS NULL`;
      return rows[0] ?? null;
    },
    /** Records a use. Callers do not await this on the request path; a lost write costs nothing. */
    async touch(id: string): Promise<void> {
      const db = connection();
      await db`UPDATE automator_api_keys SET last_used_at = now() WHERE id = ${id}`;
    },
  };
}
export type ApiKeyStore = ReturnType<typeof createApiKeyStore>;
