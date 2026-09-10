import { describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { createApiKeyStore, ApiKeyLimitError, apiKeyLimit } from "./api-keys";
import { migrate } from "./migrations";
import { createUserStore } from "./users";

const url = process.env.TEST_DATABASE_URL;

/* Hashes are unique across the whole table, so a re-run must not reuse a literal. */
const hash = () => `hash-${crypto.randomUUID()}`;

async function owner(sql: SQL): Promise<string> {
  const id = `did:privy:api-keys-${crypto.randomUUID()}`;
  await createUserStore(sql).sync(id, null);
  return id;
}

describe.skipIf(!url)("api key store", () => {
  test("lists the keys an owner holds, newest first, without their hashes", async () => {
    const sql = new SQL(url!, { max: 2, connectionTimeout: 5 });
    try {
      await migrate(sql);
      const keys = createApiKeyStore(sql);
      const ownerId = await owner(sql);
      const firstHash = hash();
      const first = await keys.create(ownerId, "CI", firstHash, "ak_aaaa");
      const second = await keys.create(ownerId, "Laptop", hash(), "ak_bbbb");

      expect(first).toMatchObject({ name: "CI", prefix: "ak_aaaa" });
      const listed = await keys.list(ownerId);
      expect(listed.map((key) => key.id)).toEqual([second.id, first.id]);
      expect(JSON.stringify(listed)).not.toContain(firstHash);
    } finally {
      await sql.close({ timeout: 5 });
    }
  });

  test("resolves an owner from a key hash and forgets a revoked one", async () => {
    const sql = new SQL(url!, { max: 2, connectionTimeout: 5 });
    try {
      await migrate(sql);
      const keys = createApiKeyStore(sql);
      const ownerId = await owner(sql);
      const key = await keys.create(ownerId, "CI", hash(), "ak_cccc");
      const live_hash = hash();
      const live = await keys.create(ownerId, "Live", live_hash, "ak_dddd");

      expect(await keys.findOwner(live_hash)).toEqual({ id: live.id, ownerId });
      expect(await keys.findOwner("hash-that-was-never-issued")).toBeNull();

      expect(await keys.revoke(ownerId, live.id)).toBe(true);
      expect(await keys.findOwner(live_hash)).toBeNull();
      expect((await keys.list(ownerId)).map((entry) => entry.id)).toEqual([key.id]);
      expect(await keys.revoke(ownerId, live.id)).toBe(false);
    } finally {
      await sql.close({ timeout: 5 });
    }
  });

  test("refuses to revoke a key another owner holds", async () => {
    const sql = new SQL(url!, { max: 2, connectionTimeout: 5 });
    try {
      await migrate(sql);
      const keys = createApiKeyStore(sql);
      const mine = await owner(sql);
      const theirs = await owner(sql);
      const key = await keys.create(mine, "CI", hash(), "ak_eeee");
      expect(await keys.revoke(theirs, key.id)).toBe(false);
      expect((await keys.list(mine)).map((entry) => entry.id)).toEqual([key.id]);
    } finally {
      await sql.close({ timeout: 5 });
    }
  });

  test("records when a key was last used", async () => {
    const sql = new SQL(url!, { max: 2, connectionTimeout: 5 });
    try {
      await migrate(sql);
      const keys = createApiKeyStore(sql);
      const ownerId = await owner(sql);
      const key = await keys.create(ownerId, "CI", hash(), "ak_ffff");
      expect(key.lastUsedAt).toBeUndefined();

      await keys.touch(key.id);
      const [used] = await keys.list(ownerId);
      expect(used?.lastUsedAt).toBeString();
    } finally {
      await sql.close({ timeout: 5 });
    }
  });

  test("stops an owner hoarding keys", async () => {
    const sql = new SQL(url!, { max: 2, connectionTimeout: 5 });
    try {
      await migrate(sql);
      const keys = createApiKeyStore(sql);
      const ownerId = await owner(sql);
      for (let index = 0; index < apiKeyLimit; index += 1)
        await keys.create(ownerId, `Key ${index}`, hash(), "ak_gggg");
      expect(keys.create(ownerId, "One too many", hash(), "ak_hhhh")).rejects.toThrow(
        ApiKeyLimitError,
      );
    } finally {
      await sql.close({ timeout: 5 });
    }
  });
});
