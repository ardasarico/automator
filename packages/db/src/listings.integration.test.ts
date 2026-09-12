import { describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { createFlowVersionStore } from "./flow-versions";
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

/* The two publishers in the browse test below. `automator_test` is shared with the e2e suite,
 * which leaves listings of its own behind, so an assertion about "the marketplace" has to mean
 * the rows this test published or it passes and fails on what ran before it. */
const publishers = new Set(["test_arda", "test_nova"]);
const publishedHere = (listing: { author: { username: string } }) =>
  publishers.has(listing.author.username);

describe.skipIf(!url)("listings store", () => {
  test("concurrent first publishes refresh one listing without losing its identity or fork count", async () => {
    const sql = new SQL(url!, { max: 2, connectionTimeout: 5 });
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
    const ownerId = `did:privy:listings-race-${suffix}`;
    try {
      await migrate(sql);
      const users = createUserStore(sql);
      const flows = createFlowStore(sql);
      const versions = createFlowVersionStore(sql);
      const listings = createListingStore(sql);
      await users.sync(ownerId, null);
      await users.saveProfile(ownerId, { name: "Publisher", username: `listing_race_${suffix}` });
      const flow = await flows.create(ownerId, input);

      const [first, second] = await Promise.all([
        listings.publish(ownerId, flow.flow, {
          name: `Concurrent ${suffix} first`,
          description: "First request",
        }),
        listings.publish(ownerId, flow.flow, {
          name: `Concurrent ${suffix} second`,
          description: "Second request",
        }),
      ]);
      expect(first.slug).toBe(second.slug);
      expect(first.publishedAt).toBe(second.publishedAt);
      const rows = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM automator_listings WHERE flow_id = ${flow.flow.id}`;
      expect(rows[0]?.count).toBe(1);

      const forked = await listings.fork(ownerId, first.slug);
      expect(forked).not.toBeNull();
      const history = await versions.list(ownerId, forked!.flow.id);
      expect(history).toHaveLength(1);
      expect(history[0]?.number).toBe(1);
      expect((await versions.find(ownerId, forked!.flow.id, 1))?.document).toEqual(forked!.flow);
      const refreshed = await listings.publish(ownerId, flow.flow, {
        name: "Refreshed after fork",
        description: "Updated snapshot",
      });
      expect(refreshed).toMatchObject({
        slug: first.slug,
        publishedAt: first.publishedAt,
        forkCount: 1,
        name: "Refreshed after fork",
      });
    } finally {
      await sql`DELETE FROM automator_users WHERE id = ${ownerId}`;
      await sql.close({ timeout: 5 });
    }
  });

  test.skipIf(!url)("publishes, re-publishes, forks and unpublishes flows", async () => {
    // Never point this at a database with real data: these two users' rows are deleted.
    const sql = new SQL(url!, { max: 2, connectionTimeout: 5 });
    /* Slugs share one namespace across the whole marketplace, so a literal "Airdrop gate" would
     * assert that nothing else in this database has ever claimed it. A run-unique name, as the
     * race test above uses, keeps the derivation and collision assertions without that bet. */
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
    const gateName = `Airdrop gate ${suffix}`;
    const gateSlug = `airdrop-gate-${suffix}`;
    try {
      await migrate(sql);
      const users = createUserStore(sql);
      const flows = createFlowStore(sql);
      const listings = createListingStore(sql);
      await sql`DELETE FROM automator_users WHERE id IN ('did:privy:test-a', 'did:privy:test-b')`;
      await users.sync("did:privy:test-a", "0xaaa");
      await users.saveProfile("did:privy:test-a", { name: "Arda", username: "test_arda" });
      await users.sync("did:privy:test-b", null);
      await users.saveProfile("did:privy:test-b", { name: "Nova", username: "test_nova" });

      const flow = await flows.create("did:privy:test-a", input);
      const published = await listings.publish("did:privy:test-a", flow.flow, {
        name: `  ${gateName} `,
        description: "Claim with World ID.",
      });
      expect(published).toMatchObject({
        slug: gateSlug,
        name: gateName,
        description: "Claim with World ID.",
        author: { name: "Arda", username: "test_arda" },
        nodeTypes: ["world.id-verify", "usdc.payout"],
        forkCount: 0,
      });
      expect(published.publishedAt).toBe(published.updatedAt);

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

      const other = await flows.create("did:privy:test-b", input);
      const second = await listings.publish("did:privy:test-b", other.flow, {
        name: gateName,
        description: "",
      });
      expect(second.slug).toBe(`${gateSlug}-2`);

      const edited = await flows.update("did:privy:test-a", flow.flow.id, {
        ...input,
        nodes: input.nodes.slice(0, 2),
        edges: input.edges,
      });
      const republished = await listings.publish("did:privy:test-a", edited!.flow, {
        name: `${gateName} v2`,
        description: "Now cheaper.",
      });
      expect(republished.slug).toBe(gateSlug);
      expect(republished.name).toBe(`${gateName} v2`);
      expect(republished.nodeTypes).toEqual(["world.id-verify"]);
      expect(republished.publishedAt).toBe(published.publishedAt);
      expect(await listings.findByFlow("did:privy:test-a", flow.flow.id)).toEqual(republished);
      expect(await listings.findByFlow("did:privy:test-b", flow.flow.id)).toBeNull();

      const detail = await listings.find(gateSlug);
      expect(detail?.document).toEqual({
        ...input,
        id: detail!.document.id,
        name: `${gateName} v2`,
        description: "Now cheaper.",
        nodes: input.nodes.slice(0, 2),
      });
      expect(await listings.find("nope")).toBeNull();

      /* `list` is the whole marketplace, and this database is shared with the e2e suite, so
       * assert on the rows these two users published rather than on everything that exists. */
      const all = await listings.list();
      expect(all.filter(publishedHere).map((item) => item.slug)).toEqual([
        `${gateSlug}-2`,
        gateSlug,
      ]);

      const forked = await listings.fork("did:privy:test-b", gateSlug);
      expect(forked?.flow).toMatchObject({
        name: `${gateName} v2`,
        description: "Now cheaper.",
        nodes: input.nodes.slice(0, 2),
      });
      expect(forked?.flow.id).not.toBe(flow.flow.id);
      /* A fork starts unpublished and unactivated, and says so rather than staying silent. */
      expect(forked?.appPublished).toBe(false);
      expect(forked?.enabled).toBe(false);
      expect(await flows.find("did:privy:test-b", forked!.flow.id)).toEqual(forked);
      expect((await listings.find(gateSlug))?.forkCount).toBe(1);
      expect(await listings.fork("did:privy:test-b", "nope")).toBeNull();

      expect(await listings.unpublish("did:privy:test-b", gateSlug)).toBe(false);
      expect(await listings.unpublish("did:privy:test-a", gateSlug)).toBe(true);
      expect(await listings.find(gateSlug)).toBeNull();
      expect(await listings.findByFlow("did:privy:test-a", flow.flow.id)).toBeNull();

      await sql`DELETE FROM automator_users WHERE id IN ('did:privy:test-a', 'did:privy:test-b')`;
      expect((await listings.list()).filter(publishedHere)).toEqual([]);
    } finally {
      await sql.close({ timeout: 5 });
    }
  });
  test.skipIf(!url)("a fork starts with no table selected on its data nodes", async () => {
    const sql = new SQL(url!, { max: 2, connectionTimeout: 5 });
    try {
      await migrate(sql);
      const users = createUserStore(sql);
      const flows = createFlowStore(sql);
      const listings = createListingStore(sql);
      await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-fork-%'`;
      await users.sync("did:privy:test-fork-a", null);
      await users.saveProfile("did:privy:test-fork-a", { name: "Arda", username: "test_fork_a" });
      await users.sync("did:privy:test-fork-b", null);

      const document = {
        ...input,
        name: "Intake",
        nodes: [
          input.nodes[0]!,
          {
            id: "n-data",
            type: "data.find-records" as const,
            position: { x: 300, y: 0 },
            label: "Find records",
            config: {
              tableId: "tbl-owned-by-publisher",
              filters: [{ column: "email", operator: "equals", value: "a@b.c" }],
              sortColumn: "email",
              sortDirection: "desc",
              limit: 25,
            },
          },
        ],
        edges: [],
      };
      const flow = await flows.create("did:privy:test-fork-a", document);
      const listing = await listings.publish("did:privy:test-fork-a", flow.flow, {
        name: "Intake",
        description: "Look up an applicant.",
      });

      const forked = await listings.fork("did:privy:test-fork-b", listing.slug);
      const node = forked!.flow.nodes.find((entry) => entry.id === "n-data");
      expect(node?.config).toMatchObject({
        tableId: "",
        filters: [],
        sortColumn: "",
        sortDirection: "desc",
        limit: 25,
      });
      const publisher = await listings.find(listing.slug);
      expect(
        publisher?.document.nodes.find((entry) => entry.id === "n-data")?.config,
      ).toMatchObject({ tableId: "tbl-owned-by-publisher" });

      await sql`DELETE FROM automator_users WHERE id LIKE 'did:privy:test-fork-%'`;
    } finally {
      await sql.close({ timeout: 5 });
    }
  });
});
