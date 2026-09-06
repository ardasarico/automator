import type { AuthUser, ProfileInput } from "@automator/contracts";
import type { SQL } from "bun";

export class UsernameTakenError extends Error {}

export function createUserStore(sql: SQL | undefined) {
  function connection() {
    if (!sql) throw new Error("Database is not configured");
    return sql;
  }
  return {
    async find(id: string): Promise<AuthUser | null> {
      const db = connection();
      const rows = await db<
        AuthUser[]
      >`SELECT id, name, username, wallet_address AS "walletAddress" FROM automator_users WHERE id = ${id}`;
      return rows[0] ?? null;
    },
    async sync(id: string, walletAddress: string | null): Promise<AuthUser> {
      const db = connection();
      const rows = await db<AuthUser[]>`
        INSERT INTO automator_users (id, wallet_address) VALUES (${id}, ${walletAddress})
        ON CONFLICT (id) DO UPDATE SET wallet_address = EXCLUDED.wallet_address
        RETURNING id, name, username, wallet_address AS "walletAddress"`;
      if (!rows[0]) throw new Error("User synchronization failed");
      return rows[0];
    },
    async saveProfile(id: string, profile: ProfileInput): Promise<AuthUser> {
      const db = connection();
      try {
        const rows = await db<AuthUser[]>`
          UPDATE automator_users SET name = ${profile.name.trim()}, username = ${profile.username}
          WHERE id = ${id}
          RETURNING id, name, username, wallet_address AS "walletAddress"`;
        if (!rows[0]) throw new Error("User does not exist");
        return rows[0];
      } catch (error) {
        if (error instanceof Error && "errno" in error && error.errno === "23505")
          throw new UsernameTakenError("Username is taken");
        throw error;
      }
    },
  };
}
export type UserStore = ReturnType<typeof createUserStore>;

export async function migrateUsers(sql: SQL) {
  await sql.begin(async (tx) => {
    // Serialize concurrent API starts before installing the initial, additive schema.
    await tx`SELECT pg_advisory_xact_lock(716301, 1)`;
    await tx`CREATE TABLE IF NOT EXISTS automator_users (
      id TEXT PRIMARY KEY,
      name TEXT CHECK (name IS NULL OR (char_length(btrim(name)) BETWEEN 1 AND 60)),
      username TEXT UNIQUE CHECK (username IS NULL OR (username ~ '^[a-z][a-z0-9_]{2,23}$')),
      wallet_address TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  });
}
