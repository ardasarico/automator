import { describe, expect, test } from "bun:test";
import { isFlowDocument } from "@automator/contracts";
import { SQL } from "bun";
import { createFlowStore } from "./flows";
import { createListingStore } from "./listings";
import { migrate } from "./migrations";
import { createRunStore } from "./runs";
import { createUserStore } from "./users";

const url = process.env.TEST_DATABASE_URL;

/** A document as the builder stored it before `world.selfie-check` was retired. */
const legacy = {
  version: 1,
  nodes: [
    { id: "n1", type: "trigger.miniapp-open", position: { x: 0, y: 0 }, label: "Open", config: {} },
    {
      id: "n2",
      type: "world.selfie-check",
      position: { x: 300, y: 0 },
      label: "Selfie",
      config: { title: "Prove you are human" },
    },
    {
      id: "n3",
      type: "world.id-verify",
      position: { x: 300, y: 200 },
      label: "Verify",
      config: {},
    },
    { id: "n4", type: "usdc.payout", position: { x: 600, y: 0 }, label: "Pay", config: {} },
  ],
  edges: [
    { id: "e1", source: "n1", target: "n2", sourceHandle: "out", targetHandle: "visitor" },
    { id: "e2", source: "n2", target: "n4", sourceHandle: "verified", targetHandle: "in" },
  ],
};

/** The same document after the migration; typed loosely because it is compared, not used. */
const migrated: { version: number; nodes: unknown[]; edges: unknown[] } = {
  ...legacy,
  nodes: legacy.nodes.map((node) =>
    node.type === "world.selfie-check" ? { ...node, type: "world.id-verify" } : node,
  ),
};

describe.skipIf(!url)("migration 0008 retires world.selfie-check", () => {
  test.skipIf(!url)("rewrites stored flows, listings and runs to world.id-verify", async () => {
    // Never point this at a database with real data: test rows are deleted by id prefix.
    const sql = new SQL(url!, { max: 2, connectionTimeout: 5 });
    try {
      await migrate(sql);
      const users = createUserStore(sql);
      const flows = createFlowStore(sql);
      const listings = createListingStore(sql);
      const runs = createRunStore(sql);
      await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
      await users.sync("did:privy:test-a", "0xaaa");
      await users.saveProfile("did:privy:test-a", { name: "Arda", username: "test_arda" });

      const flowId = `test-${crypto.randomUUID()}`;
      const listingId = `test-${crypto.randomUUID()}`;
      const nodeTypes = ["world.selfie-check", "world.id-verify", "usdc.payout"];
      await sql`INSERT INTO automator_flows (id, owner_id, name, description, document)
        VALUES (${flowId}, 'did:privy:test-a', 'Legacy', '', ${legacy}::jsonb)`;
      await sql`INSERT INTO automator_listings
          (id, slug, flow_id, owner_id, name, description, document, node_types)
        VALUES (${listingId}, 'test-legacy-listing', ${flowId}, 'did:privy:test-a', 'Legacy', '',
          ${legacy}::jsonb, ${nodeTypes}::jsonb)`;
      const runId = `test-${crypto.randomUUID()}`;
      const result = {
        id: runId,
        flowId,
        status: "succeeded",
        startedAt: "2026-09-07T10:00:00.000Z",
        finishedAt: "2026-09-07T10:00:01.000Z",
        trigger: { nodeId: "n1", payload: {} },
        nodes: [],
        variables: {},
      };
      await sql`INSERT INTO automator_runs
          (id, flow_id, owner_id, status, name, description, document, result, started_at, finished_at)
        VALUES (${runId}, ${flowId}, 'did:privy:test-a', 'succeeded', 'Legacy', '',
          ${legacy}::jsonb, ${result}::jsonb,
          ${result.startedAt}::timestamptz, ${result.finishedAt}::timestamptz)`;

      // The ledger already has the entry on a reused test database; re-run it on the rows above.
      await sql`DELETE FROM automator_migrations WHERE name = '0008_retire_selfie_check'`;
      expect(await migrate(sql)).toEqual(["0008_retire_selfie_check"]);

      const record = await flows.find("did:privy:test-a", flowId);
      expect(record).not.toBeNull();
      expect(isFlowDocument(record!.flow)).toBe(true);
      // Only the type changes: config, labels, positions and edges stay as they were.
      expect<unknown>(record!.flow.nodes).toEqual(migrated.nodes);
      expect(record!.flow.edges).toEqual(legacy.edges);

      const listing = await listings.find("test-legacy-listing");
      expect(isFlowDocument(listing!.document)).toBe(true);
      expect<unknown>(listing!.document.nodes).toEqual(migrated.nodes);
      expect(listing!.nodeTypes).toEqual(["world.id-verify", "usdc.payout"]);

      const run = await runs.find("did:privy:test-a", runId);
      expect(isFlowDocument(run!.document)).toBe(true);
      expect<unknown>(run!.document.nodes).toEqual(migrated.nodes);

      // Running the migration again is a no-op that leaves the rewritten rows alone.
      await sql`DELETE FROM automator_migrations WHERE name = '0008_retire_selfie_check'`;
      await migrate(sql);
      const stored = await sql<{ document: unknown }[]>`
        SELECT document FROM automator_flows WHERE id = ${flowId}`;
      expect(stored[0]?.document).toEqual(migrated);

      await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
    } finally {
      await sql.close({ timeout: 5 });
    }
  });
});
