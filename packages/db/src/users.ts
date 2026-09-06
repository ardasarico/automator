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
        ON CONFLICT (id) DO UPDATE SET
          wallet_address = COALESCE(EXCLUDED.wallet_address, automator_users.wallet_address)
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
