import type { DatabaseStatus } from "@automator/contracts";
import { SQL } from "bun";
import { createUserStore, migrateUsers } from "./users";
export { UsernameTakenError, type UserStore } from "./users";

export function createDatabase(url: string | undefined) {
  const sql = url ? new SQL(url, { max: 5, connectionTimeout: 3, idleTimeout: 20 }) : undefined;

  return {
    users: createUserStore(sql),
    async migrate() {
      if (sql) await migrateUsers(sql);
    },
    async check(): Promise<DatabaseStatus> {
      if (!sql) return "not_configured";

      const query = sql`SELECT 1`.execute();
      let timer: ReturnType<typeof setTimeout> | undefined;

      try {
        await Promise.race([
          query,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              query.cancel();
              reject(new Error("Database health check timed out"));
            }, 3000);
          }),
        ]);
        return "up";
      } catch {
        return "down";
      } finally {
        clearTimeout(timer);
      }
    },
    async close() {
      await sql?.close({ timeout: 5 });
    },
  };
}
