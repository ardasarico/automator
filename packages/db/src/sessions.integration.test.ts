import { describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { createFlowStore } from "./flows";
import { migrate } from "./migrations";
import { createSessionStore, type MiniAppSessionRow } from "./sessions";
import { createUserStore } from "./users";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("session claims", () => {
  test("persists World request bindings and refuses a stale binding when claiming", async () => {
    const sql = new SQL(url!, { max: 2, connectionTimeout: 5 });
    const ownerId = `did:privy:audit-world-session-${crypto.randomUUID()}`;
    try {
      await migrate(sql);
      await createUserStore(sql).sync(ownerId, null);
      const { flow } = await createFlowStore(sql).create(ownerId, {
        version: 1,
        name: "World request binding",
        description: "",
        nodes: [],
        edges: [],
      });
      const sessions = createSessionStore(sql);
      const row: MiniAppSessionRow = {
        id: crypto.randomUUID(),
        flowId: flow.id,
        ownerId,
        tokenHash: "world-token-hash",
        status: "screen",
        nodeId: "world-screen",
        variables: {},
        payload: {},
        lastRunId: crypto.randomUUID(),
        worldNonce: "nonce-first",
        worldExpiresAt: 2_200_000_000,
      };
      await sessions.create(row);
      expect(await sessions.find(flow.id, row.id)).toEqual(row);
      expect(await sessions.claim({ ...row, worldNonce: "another-session-nonce" })).toBe(false);
      expect(await sessions.claim({ ...row, worldExpiresAt: row.worldExpiresAt! + 1 })).toBe(false);

      const refreshed = { ...row, worldNonce: "nonce-next", worldExpiresAt: 2_200_000_300 };
      await sessions.update(row.id, refreshed);
      expect(await sessions.find(flow.id, row.id)).toEqual(refreshed);
      expect(await sessions.claim(row)).toBe(false);
      expect(await sessions.claim(refreshed)).toBe(true);
      expect(await sessions.claim(refreshed)).toBe(false);
      await sessions.update(row.id, {
        ...refreshed,
        status: "end",
        nodeId: null,
        worldNonce: null,
        worldExpiresAt: null,
      });
      expect(await sessions.find(flow.id, row.id)).toMatchObject({
        worldNonce: null,
        worldExpiresAt: null,
      });

      // Inserts written before the additive migration keep working and receive null bindings.
      const legacyId = crypto.randomUUID();
      await sql`INSERT INTO automator_sessions (id, flow_id, owner_id, token_hash, status)
        VALUES (${legacyId}, ${flow.id}, ${ownerId}, 'legacy-token-hash', 'end')`;
      expect(await sessions.find(flow.id, legacyId)).toMatchObject({
        worldNonce: null,
        worldExpiresAt: null,
      });
    } finally {
      await sql`DELETE FROM automator_users WHERE id = ${ownerId}`;
      await sql.close({ timeout: 5 });
    }
  });

  test.skipIf(!url)("only one concurrent answer can claim a screen", async () => {
    const sql = new SQL(url!, { max: 4, connectionTimeout: 5 });
    const ownerId = "did:privy:audit-session-concurrency";
    try {
      await migrate(sql);
      await createUserStore(sql).sync(ownerId, null);
      const flow = await createFlowStore(sql).create(ownerId, {
        version: 1,
        name: "Session claim",
        description: "",
        nodes: [],
        edges: [],
      });
      const sessions = createSessionStore(sql);
      const row: MiniAppSessionRow = {
        id: crypto.randomUUID(),
        flowId: flow.flow.id,
        ownerId,
        tokenHash: "abc",
        status: "screen",
        nodeId: "screen-1",
        variables: {},
        payload: {},
        lastRunId: crypto.randomUUID(),
        worldNonce: null,
        worldExpiresAt: null,
      };
      await sessions.create(row);
      const claims = await Promise.all(Array.from({ length: 8 }, () => sessions.claim(row)));
      expect(claims.filter(Boolean)).toHaveLength(1);
      expect(await sessions.find(row.flowId, row.id)).toMatchObject({
        status: "failed",
        nodeId: null,
      });
      await sessions.update(row.id, {
        status: "screen",
        nodeId: "screen-2",
        variables: {},
        lastRunId: crypto.randomUUID(),
        worldNonce: null,
        worldExpiresAt: null,
      });
      expect(await sessions.claim(row)).toBe(false);
      expect((await sessions.find(row.flowId, row.id))?.nodeId).toBe("screen-2");
    } finally {
      await sql`DELETE FROM automator_users WHERE id = ${ownerId}`;
      await sql.close({ timeout: 5 });
    }
  });
});
