import { describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { createFlowStore } from "./flows";
import { createListingStore } from "./listings";
import { migrate } from "./migrations";
import { createUserStore } from "./users";

const url = process.env.TEST_DATABASE_URL;

const input = {
  version: 1 as const,
  name: "Airdrop gate",
  description: "Only verified humans can claim.",
  nodes: [
    {
      id: "n1",
      type: "trigger.miniapp-open" as const,
      position: { x: 0, y: 0 },
      label: "Mini-app opened",
      config: {},
    },
    {
      id: "n2",
      type: "world.id-verify" as const,
      position: { x: 300, y: 0 },
      label: "Verify",
      config: {},
    },
    {
      id: "n3",
      type: "usdc.payout" as const,
      position: { x: 600, y: 0 },
      label: "Pay",
      config: {},
    },
  ],
  edges: [{ id: "e1", source: "n1", target: "n2", sourceHandle: "out", targetHandle: "in" }],
};

describe.skipIf(!url)("listings store", () => {
  test.skipIf(!url)("publishes, re-publishes, forks and unpublishes flows", async () => {
    // Never point this at a database with real data: test rows are deleted by id prefix.
    const sql = new SQL(url!, { max: 2, connectionTimeout: 5 });
    try {
      await migrate(sql);
      const users = createUserStore(sql);
      const flows = createFlowStore(sql);
      const listings = createListingStore(sql);
      await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
      await users.sync("did:privy:test-a", "0xaaa");
      await users.saveProfile("did:privy:test-a", { name: "Arda", username: "test_arda" });
      await users.sync("did:privy:test-b", null);
      await users.saveProfile("did:privy:test-b", { name: "Nova", username: "test_nova" });

      const flow = await flows.create("did:privy:test-a", input);
      const published = await listings.publish("did:privy:test-a", flow.flow, {
        name: "  Airdrop gate ",
        description: "Claim with World ID.",
      });
      expect(published).toMatchObject({
        slug: "airdrop-gate",
        name: "Airdrop gate",
        description: "Claim with World ID.",
        author: { name: "Arda", username: "test_arda" },
        nodeTypes: ["world.id-verify", "usdc.payout"],
        forkCount: 0,
      });
      expect(published.publishedAt).toBe(published.updatedAt);

      // A name that slugifies to a reserved slug (a curated example's) skips past it.
      const curatedName = await flows.create("did:privy:test-b", {
        ...input,
        name: "Approval request",
      });
      const curated = await listings.publish("did:privy:test-b", curatedName.flow, {
        name: "Approval request",
        description: "",
      });
      expect(curated.slug).toBe("approval-request-2");
      expect(await listings.unpublish("did:privy:test-b", "approval-request-2")).toBe(true);

      // A second flow with the same name gets the next free slug.
      const other = await flows.create("did:privy:test-b", input);
      const second = await listings.publish("did:privy:test-b", other.flow, {
        name: "Airdrop gate",
        description: "",
      });
      expect(second.slug).toBe("airdrop-gate-2");

      // Re-publishing the same flow keeps its slug and refreshes the snapshot.
      const edited = await flows.update("did:privy:test-a", flow.flow.id, {
        ...input,
        nodes: input.nodes.slice(0, 2),
        edges: input.edges,
      });
      const republished = await listings.publish("did:privy:test-a", edited!.flow, {
        name: "Airdrop gate v2",
        description: "Now cheaper.",
      });
      expect(republished.slug).toBe("airdrop-gate");
      expect(republished.name).toBe("Airdrop gate v2");
      expect(republished.nodeTypes).toEqual(["world.id-verify"]);
      expect(republished.publishedAt).toBe(published.publishedAt);
      expect(await listings.findByFlow("did:privy:test-a", flow.flow.id)).toEqual(republished);
      expect(await listings.findByFlow("did:privy:test-b", flow.flow.id)).toBeNull();

      const detail = await listings.find("airdrop-gate");
      expect(detail?.document).toEqual({
        ...input,
        id: detail!.document.id,
        name: "Airdrop gate v2",
        description: "Now cheaper.",
        nodes: input.nodes.slice(0, 2),
      });
      expect(await listings.find("nope")).toBeNull();

      const all = await listings.list();
      expect(all.map((item) => item.slug)).toEqual(["airdrop-gate-2", "airdrop-gate"]);

      // Forking copies the snapshot into the forker's flows and counts it.
      const forked = await listings.fork("did:privy:test-b", "airdrop-gate");
      expect(forked?.flow).toMatchObject({
        name: "Airdrop gate v2",
        description: "Now cheaper.",
        nodes: input.nodes.slice(0, 2),
      });
      expect(forked?.flow.id).not.toBe(flow.flow.id);
      expect(await flows.find("did:privy:test-b", forked!.flow.id)).toEqual(forked);
      expect((await listings.find("airdrop-gate"))?.forkCount).toBe(1);
      expect(await listings.fork("did:privy:test-b", "nope")).toBeNull();

      // Only the owner can unpublish.
      expect(await listings.unpublish("did:privy:test-b", "airdrop-gate")).toBe(false);
      expect(await listings.unpublish("did:privy:test-a", "airdrop-gate")).toBe(true);
      expect(await listings.find("airdrop-gate")).toBeNull();
      expect(await listings.findByFlow("did:privy:test-a", flow.flow.id)).toBeNull();

      await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-%'`;
      expect(await listings.list()).toEqual([]);
    } finally {
      await sql.close({ timeout: 5 });
    }
  });
});
