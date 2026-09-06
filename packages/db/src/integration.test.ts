import { describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { migrate, migrations } from "./migrations";
import { createUserStore, UsernameTakenError } from "./users";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("live PostgreSQL schema", () => {
  test.skipIf(!url)("migrates idempotently and enforces the username constraints", async () => {
    // Never point this at a database with real data: the tables are truncated.
    const sql = new SQL(url!, { max: 2, connectionTimeout: 5 });
    try {
      await migrate(sql);
      await migrate(sql);

      const ledger = await sql<{ name: string }[]>`SELECT name FROM automator_migrations`;
      expect(ledger.map((row) => row.name).sort()).toEqual(migrations.map((m) => m.name).sort());

      const users = createUserStore(sql);
      await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
      await users.sync("did:privy:test-a", "0xaaa");
      await users.sync("did:privy:test-b", null);
      await users.saveProfile("did:privy:test-a", { name: "A", username: "shared_name" });
      await expect(
        users.saveProfile("did:privy:test-b", { name: "B", username: "shared_name" }),
      ).rejects.toBeInstanceOf(UsernameTakenError);

      await users.sync("did:privy:test-a", null);
      expect(await users.find("did:privy:test-a")).toMatchObject({ walletAddress: "0xaaa" });

      await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
    } finally {
      await sql.close({ timeout: 5 });
    }
  });
});

test.skipIf(Boolean(url))("live database tests need TEST_DATABASE_URL", () => {
  console.log("Skipping packages/db integration tests: TEST_DATABASE_URL is not set.");
  expect(url).toBeUndefined();
});
