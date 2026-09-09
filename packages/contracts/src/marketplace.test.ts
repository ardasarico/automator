import { Value } from "@sinclair/typebox/value";
import { describe, expect, test } from "bun:test";
import { buildPath, parseResponse } from "./contract";
import { documentOutline, type FlowDocument } from "./flows";
import {
  forkListingContract,
  getListingContract,
  isPublishListingInput,
  listingNodeTypes,
  listingSlugSchema,
  marketplaceListingDetailSchema,
  marketplaceListingSchema,
  redactFlowSecrets,
  restoreFlowSecrets,
  reservedListingSlugs,
  slugifyListingName,
  type MarketplaceListing,
} from "./marketplace";

const document: FlowDocument = {
  version: 1,
  id: "flow-1",
  name: "Airdrop gate",
  description: "",
  nodes: [
    { id: "n1", type: "trigger.miniapp-open", position: { x: 0, y: 0 }, label: "Open", config: {} },
    { id: "n2", type: "world.id-verify", position: { x: 1, y: 0 }, label: "Verify", config: {} },
    { id: "n3", type: "logic.condition", position: { x: 2, y: 0 }, label: "Human?", config: {} },
    { id: "n4", type: "world.id-verify", position: { x: 3, y: 0 }, label: "Again", config: {} },
    { id: "n5", type: "usdc.payout", position: { x: 4, y: 0 }, label: "Pay", config: {} },
    { id: "n6", type: "screen.confirmation", position: { x: 5, y: 0 }, label: "Done", config: {} },
    { id: "n7", type: "notify.email", position: { x: 6, y: 0 }, label: "Mail", config: {} },
  ],
  edges: [],
};

const listing: MarketplaceListing = {
  slug: "airdrop-gate",
  name: "Airdrop gate",
  description: "Only verified humans can claim.",
  author: { name: "Arda", username: "arda" },
  nodeTypes: ["world.id-verify", "usdc.payout"],
  outline: documentOutline(document),
  forkCount: 3,
  publishedAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-02T10:00:00.000Z",
};

describe("listing schemas", () => {
  test("accept a listing and its detail", () => {
    expect(Value.Check(marketplaceListingSchema, listing)).toBe(true);
    expect(Value.Check(marketplaceListingDetailSchema, { ...listing, document })).toBe(true);
    expect(Value.Check(marketplaceListingSchema, { ...listing, forkCount: -1 })).toBe(false);
    expect(Value.Check(marketplaceListingSchema, { ...listing, nodeTypes: ["nope"] })).toBe(false);
  });

  test("slugs are lowercase hyphenated words", () => {
    for (const ok of ["a", "ticket-checkout", "v2-beta"])
      expect(Value.Check(listingSlugSchema, ok)).toBe(true);
    for (const bad of ["", "Ticket", "a--b", "-a", "a-", "a b", "a/b"])
      expect(Value.Check(listingSlugSchema, bad)).toBe(false);
  });

  test("publish input needs a visible name, a flow id and a short description", () => {
    expect(isPublishListingInput({ flowId: "f", name: "Gate", description: "" })).toBe(true);
    expect(isPublishListingInput({ flowId: "", name: "Gate", description: "" })).toBe(false);
    expect(isPublishListingInput({ flowId: "f", name: "   ", description: "" })).toBe(false);
    expect(isPublishListingInput({ flowId: "f", name: "Gate", description: "x".repeat(281) })).toBe(
      false,
    );
    expect(isPublishListingInput({ flowId: "f", name: "Gate", description: "", extra: 1 })).toBe(
      false,
    );
  });
});

describe("slugifyListingName", () => {
  test("lowercases, strips accents and punctuation, and hyphenates", () => {
    expect(slugifyListingName("Ticket checkout")).toBe("ticket-checkout");
    expect(slugifyListingName("  Crème brûlée!  ")).toBe("creme-brulee");
    expect(slugifyListingName("v2 — beta / invites")).toBe("v2-beta-invites");
  });
  test("falls back to `flow` and respects the length limit", () => {
    expect(slugifyListingName("!!!")).toBe("flow");
    expect(slugifyListingName("")).toBe("flow");
    const long = slugifyListingName("word ".repeat(30));
    expect(long.length).toBeLessThanOrEqual(60);
    expect(Value.Check(listingSlugSchema, long)).toBe(true);
  });
});

test("reserved slugs are valid slugs the API must skip", () => {
  for (const slug of reservedListingSlugs) expect(Value.Check(listingSlugSchema, slug)).toBe(true);
  expect(reservedListingSlugs.has("event-check-in")).toBe(true);
});

test("listingNodeTypes skips triggers and duplicates and stops at four", () => {
  expect(listingNodeTypes(document)).toEqual([
    "world.id-verify",
    "logic.condition",
    "usdc.payout",
    "screen.confirmation",
  ]);
  expect(listingNodeTypes({ nodes: [] })).toEqual([]);
});

test("contracts build paths and parse responses", () => {
  expect(buildPath(getListingContract, { slug: "airdrop-gate" })).toBe("/marketplace/airdrop-gate");
  expect(buildPath(forkListingContract, { slug: "airdrop-gate" })).toBe(
    "/marketplace/airdrop-gate/fork",
  );
  const parsed = parseResponse(getListingContract, 200, { listing: { ...listing, document } });
  expect(parsed.status).toBe(200);
  expect(() => parseResponse(getListingContract, 200, { listing })).toThrow();
  expect(parseResponse(getListingContract, 404, { error: "not_found" }).status).toBe(404);
});

test("redactFlowSecrets blanks secret config fields and leaves everything else", () => {
  const redacted = redactFlowSecrets({
    nodes: [
      {
        id: "n1",
        type: "notify.discord",
        position: { x: 0, y: 0 },
        label: "Post",
        config: { webhookUrl: "https://discord.com/api/webhooks/1/abc", content: "hi" },
      },
      {
        id: "n2",
        type: "screen.page",
        position: { x: 0, y: 0 },
        label: "Page",
        config: { title: "T" },
      },
      {
        id: "n3",
        type: "usdc.payment",
        position: { x: 0, y: 0 },
        label: "Pay",
        config: { key: "k" },
      },
    ],
  });
  expect(redacted.nodes.map((node) => node.config)).toEqual([
    { webhookUrl: "", content: "hi" },
    { title: "T" },
    { key: "k" },
  ]);
});

test("restoreFlowSecrets puts the canvas's secrets back into a redacted, edited document", () => {
  const position = { x: 0, y: 0 };
  const canvas = {
    nodes: [
      {
        id: "n1",
        type: "notify.discord" as const,
        position,
        label: "Post",
        config: { webhookUrl: "https://discord.com/api/webhooks/1/abc", content: "hi" },
      },
      {
        id: "n2",
        type: "notify.discord" as const,
        position,
        label: "Other",
        config: { webhookUrl: "https://discord.com/api/webhooks/2/def", content: "x" },
      },
    ],
  };
  const proposal = {
    nodes: [
      { ...canvas.nodes[0]!, config: { webhookUrl: "", content: "hello" } },
      { ...canvas.nodes[1]!, config: { webhookUrl: "https://example.test/hook", content: "x" } },
      { id: "n3", type: "notify.discord" as const, position, label: "New", config: {} },
    ],
  };
  expect(restoreFlowSecrets(proposal, canvas).nodes.map((node) => node.config)).toEqual([
    { webhookUrl: "https://discord.com/api/webhooks/1/abc", content: "hello" },
    { webhookUrl: "https://example.test/hook", content: "x" },
    {},
  ]);
  expect(restoreFlowSecrets(redactFlowSecrets(canvas), canvas)).toEqual(canvas);
});
