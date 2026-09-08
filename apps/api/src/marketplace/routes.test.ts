import { describe, expect, test } from "bun:test";
import {
  forkListingContract,
  getFlowListingContract,
  getListingContract,
  listListingsContract,
  parseResponse,
  publishListingContract,
  slugifyListingName,
  type FlowRecord,
  type MarketplaceListing,
  type MarketplaceListingDetail,
} from "@automator/contracts";
import type { AuthUser, FlowDocumentInput } from "@automator/contracts";
import type { FlowStore, ListingStore, UserStore } from "@automator/db";
import { createApp } from "../app";
import type { IdentityProvider } from "../auth/privy";

const input: FlowDocumentInput = {
  version: 1,
  name: "Airdrop gate",
  description: "Only verified humans can claim.",
  nodes: [
    { id: "n1", type: "trigger.miniapp-open", position: { x: 0, y: 0 }, label: "Open", config: {} },
    { id: "n2", type: "world.id-verify", position: { x: 300, y: 0 }, label: "Verify", config: {} },
  ],
  edges: [{ id: "e1", source: "n1", target: "n2", sourceHandle: "out", targetHandle: "in" }],
};

const profiles: Record<string, AuthUser> = {
  "did:privy:alice": {
    id: "did:privy:alice",
    name: "Alice",
    username: "alice",
    walletAddress: "0xa",
  },
  "did:privy:bob": { id: "did:privy:bob", name: "Bob", username: "bob", walletAddress: "0xb" },
  "did:privy:newbie": { id: "did:privy:newbie", name: null, username: null, walletAddress: "0xc" },
};

function fixture(listingOverrides: Partial<ListingStore> = {}) {
  const flowRecords = new Map<string, FlowRecord & { ownerId: string }>();
  const listingRows = new Map<
    string,
    MarketplaceListingDetail & { ownerId: string; flowId: string }
  >();
  let clock = 0;
  const stamp = () => new Date(1_757_200_000_000 + clock++ * 1000).toISOString();
  const strip = ({ ownerId: _owner, ...record }: FlowRecord & { ownerId: string }) => record;
  const publicListing = ({
    ownerId: _owner,
    flowId: _flow,
    document: _document,
    ...listing
  }: MarketplaceListingDetail & { ownerId: string; flowId: string }): MarketplaceListing => listing;

  const users = {
    find: async (id: string) => profiles[id] ?? null,
  } as unknown as UserStore;
  const flows = {
    find: async (ownerId, id) => {
      const record = flowRecords.get(id);
      return record && record.ownerId === ownerId ? strip(record) : null;
    },
    create: async (ownerId, body) => {
      const id = `flow-${flowRecords.size + 1}`;
      const now = stamp();
      const record = { ownerId, flow: { ...body, id }, createdAt: now, updatedAt: now };
      flowRecords.set(id, record);
      return strip(record);
    },
  } as FlowStore;
  const listings: ListingStore = {
    list: async () => [...listingRows.values()].map(publicListing).reverse(),
    find: async (slug) => {
      const row = listingRows.get(slug);
      if (!row) return null;
      const { ownerId: _owner, flowId: _flow, ...detail } = row;
      return detail;
    },
    findByFlow: async (ownerId, flowId) => {
      const row = [...listingRows.values()].find(
        (item) => item.ownerId === ownerId && item.flowId === flowId,
      );
      return row ? publicListing(row) : null;
    },
    publish: async (ownerId, flow, body) => {
      const existing = [...listingRows.values()].find(
        (item) => item.ownerId === ownerId && item.flowId === flow.id,
      );
      const author = { name: profiles[ownerId]!.name!, username: profiles[ownerId]!.username! };
      const slug = existing?.slug ?? slugifyListingName(body.name);
      const row = {
        ownerId,
        flowId: flow.id,
        slug,
        name: body.name.trim(),
        description: body.description,
        author,
        nodeTypes: ["world.id-verify" as const],
        forkCount: existing?.forkCount ?? 0,
        publishedAt: existing?.publishedAt ?? stamp(),
        updatedAt: stamp(),
        document: { ...flow, id: `listing-${slug}` },
      };
      listingRows.set(slug, row);
      return publicListing(row);
    },
    unpublish: async (ownerId, slug) => {
      const row = listingRows.get(slug);
      if (!row || row.ownerId !== ownerId) return false;
      listingRows.delete(slug);
      return true;
    },
    fork: async (ownerId, slug) => {
      const row = listingRows.get(slug);
      if (!row) return null;
      row.forkCount += 1;
      const { id: _id, ...body } = row.document;
      return flows.create(ownerId, body);
    },
    ...listingOverrides,
  };
  const identity: IdentityProvider = {
    verify: async (token) =>
      ["alice", "bob", "newbie", "ghost"].includes(token)
        ? { id: `did:privy:${token}`, expiresAt: 2_000_000_000 }
        : null,
    walletAddress: async () => null,
  };
  const app = createApp({
    database: { check: async () => "up" },
    users,
    flows,
    listings,
    identity,
  });
  const request = (path: string, method = "GET", token?: string, body?: unknown) =>
    app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  return { request, flows };
}

describe("marketplace routes", () => {
  test.each([undefined, "forged"])("token %s is rejected on every route", async (token) => {
    const { request } = fixture();
    for (const [path, method, body] of [
      ["/marketplace", "GET", undefined],
      ["/marketplace/x", "GET", undefined],
      ["/marketplace", "POST", { flowId: "f", name: "n", description: "" }],
      ["/marketplace/x", "DELETE", undefined],
      ["/marketplace/x/fork", "POST", undefined],
      ["/flows/f/listing", "GET", undefined],
    ] as const) {
      const response = await request(path, method, token, body);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthorized" });
    }
  });

  test("publish, browse, fork, and unpublish", async () => {
    const { request, flows } = fixture();
    const flow = await flows.create("did:privy:alice", input);

    const before = await request(`/flows/${flow.flow.id}/listing`, "GET", "alice");
    expect(parseResponse(getFlowListingContract, before.status, await before.json()).data).toEqual({
      listing: null,
    });

    const published = await request("/marketplace", "POST", "alice", {
      flowId: flow.flow.id,
      name: "Airdrop gate",
      description: "Claim with World ID.",
    });
    const publishedResult = parseResponse(
      publishListingContract,
      published.status,
      await published.json(),
    );
    if (publishedResult.status !== 200)
      throw new Error(`Publish answered ${publishedResult.status}`);
    const { listing } = publishedResult.data;
    expect(listing).toMatchObject({
      slug: "airdrop-gate",
      author: { name: "Alice", username: "alice" },
      forkCount: 0,
    });

    const listed = await request("/marketplace", "GET", "bob");
    expect(parseResponse(listListingsContract, listed.status, await listed.json()).data).toEqual({
      listings: [listing],
    });
    const detail = await request("/marketplace/airdrop-gate", "GET", "bob");
    const detailResult = parseResponse(getListingContract, detail.status, await detail.json());
    if (detailResult.status !== 200) throw new Error(`Detail answered ${detailResult.status}`);
    expect(detailResult.data.listing.document.nodes).toEqual(input.nodes);

    const forked = await request("/marketplace/airdrop-gate/fork", "POST", "bob");
    const forkResult = parseResponse(forkListingContract, forked.status, await forked.json());
    if (forkResult.status !== 201) throw new Error(`Fork answered ${forkResult.status}`);
    const record = forkResult.data;
    expect(record.flow.nodes).toEqual(input.nodes);
    expect(await flows.find("did:privy:bob", record.flow.id)).toEqual(record);
    const afterFork = (await (await request("/marketplace/airdrop-gate", "GET", "bob")).json()) as {
      listing: MarketplaceListing;
    };
    expect(afterFork.listing).toMatchObject({ forkCount: 1 });

    const again = await request("/marketplace", "POST", "alice", {
      flowId: flow.flow.id,
      name: "Airdrop gate v2",
      description: "",
    });
    expect(((await again.json()) as { listing: MarketplaceListing }).listing).toMatchObject({
      slug: "airdrop-gate",
      name: "Airdrop gate v2",
    });
    const mine = await request(`/flows/${flow.flow.id}/listing`, "GET", "alice");
    expect(((await mine.json()) as { listing: MarketplaceListing }).listing?.slug).toBe(
      "airdrop-gate",
    );

    expect((await request("/marketplace/airdrop-gate", "DELETE", "bob")).status).toBe(404);
    const removed = await request("/marketplace/airdrop-gate", "DELETE", "alice");
    expect(await removed.json()).toEqual({ slug: "airdrop-gate" });
    expect((await request("/marketplace/airdrop-gate", "GET", "alice")).status).toBe(404);
    expect((await request("/marketplace/airdrop-gate/fork", "POST", "bob")).status).toBe(404);
  });

  test("publishing checks the input, the caller's profile, and flow ownership", async () => {
    const { request, flows } = fixture();
    const flow = await flows.create("did:privy:alice", input);
    const publish = (token: string, body: unknown) => request("/marketplace", "POST", token, body);

    const invalid = await publish("alice", { flowId: flow.flow.id, name: "  ", description: "" });
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toEqual({ error: "invalid_listing" });

    const notOwned = await publish("bob", { flowId: flow.flow.id, name: "Mine", description: "" });
    expect(notOwned.status).toBe(404);

    const notOnboarded = await publish("newbie", {
      flowId: flow.flow.id,
      name: "Mine",
      description: "",
    });
    expect(notOnboarded.status).toBe(403);

    const noUser = await publish("ghost", { flowId: flow.flow.id, name: "Mine", description: "" });
    expect(noUser.status).toBe(401);
    expect((await request("/marketplace/x/fork", "POST", "ghost")).status).toBe(401);
  });

  test("publishing strips secret config fields from the snapshot", async () => {
    const { request, flows } = fixture();
    const flow = await flows.create("did:privy:alice", {
      ...input,
      nodes: [
        ...input.nodes,
        {
          id: "n3",
          type: "notify.discord",
          position: { x: 600, y: 0 },
          label: "Post",
          config: { webhookUrl: "https://discord.com/api/webhooks/1/abc", content: "hi" },
        },
      ],
      edges: [],
    });
    await request("/marketplace", "POST", "alice", {
      flowId: flow.flow.id,
      name: "Secret",
      description: "",
    });
    const detail = (await (await request("/marketplace/secret", "GET", "bob")).json()) as {
      listing: MarketplaceListingDetail;
    };
    expect(detail.listing.document.nodes.at(-1)?.config).toEqual({ webhookUrl: "", content: "hi" });
    expect((await flows.find("did:privy:alice", flow.flow.id))?.flow.nodes.at(-1)?.config).toEqual({
      webhookUrl: "https://discord.com/api/webhooks/1/abc",
      content: "hi",
    });
  });

  test("publishing a stale stored flow is refused before changing the listing", async () => {
    let published = false;
    const { request, flows } = fixture({
      publish: async () => {
        published = true;
        throw new Error("A stale document must never be published");
      },
    });
    const flow = await flows.create("did:privy:alice", {
      ...input,
      nodes: [{ ...input.nodes[1]!, type: "world.retired" as never }],
      edges: [],
    });
    const response = await request("/marketplace", "POST", "alice", {
      flowId: flow.flow.id,
      name: "Stale",
      description: "",
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "invalid_flow" });
    expect(published).toBe(false);
  });

  test("a stale snapshot is refused on read and before creating a fork", async () => {
    const stale: MarketplaceListingDetail = {
      slug: "stale",
      name: "Stale",
      description: "",
      author: { name: "Alice", username: "alice" },
      nodeTypes: [],
      forkCount: 0,
      publishedAt: "2026-09-07T10:00:00.000Z",
      updatedAt: "2026-09-07T10:00:00.000Z",
      document: {
        ...input,
        id: "listing-stale",
        nodes: [{ ...input.nodes[1]!, type: "world.retired" as never }],
        edges: [],
      },
    };
    let forked = false;
    const { request } = fixture({
      find: async () => stale,
      fork: async () => {
        forked = true;
        throw new Error("A stale snapshot must never be forked");
      },
    });
    const response = await request("/marketplace/stale", "GET", "bob");
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "invalid_flow" });
    const fork = await request("/marketplace/stale/fork", "POST", "bob");
    expect(fork.status).toBe(422);
    expect(await fork.json()).toEqual({ error: "invalid_flow" });
    expect(forked).toBe(false);
  });

  test("slugs that fail the contract pattern answer 400 before storage", async () => {
    const { request } = fixture();
    const response = await request("/marketplace/Not%20A%20Slug", "GET", "alice");
    expect(response.status).toBe(400);
  });
});
