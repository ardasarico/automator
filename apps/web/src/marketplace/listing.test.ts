import { describe, expect, test } from "bun:test";
import {
  authorLabel,
  browseListings,
  isOwnListing,
  listingCategories,
  type MarketplaceItem,
} from "./listing";

const curated: MarketplaceItem = {
  slug: "ticket-checkout",
  name: "Ticket checkout",
  description: "Verify a visitor, collect payment and issue a ticket.",
  author: { kind: "automator" },
  nodeTypes: ["world.id-verify", "privy.wallet"],
  steps: [],
  forkCount: 12,
};
const mine: MarketplaceItem = {
  slug: "arda/airdrop-gate",
  name: "Airdrop gate",
  description: "Only verified humans can claim.",
  author: { kind: "user", name: "Arda", username: "arda" },
  nodeTypes: ["world.id-verify", "usdc.payout"],
  steps: [],
  forkCount: 3,
  publishedAt: "2026-09-01T10:00:00.000Z",
};
const theirs: MarketplaceItem = {
  slug: "nova/beta-invites",
  name: "Beta invites",
  description: "Approve testers and email them a code.",
  author: { kind: "user", name: "Nova", username: "nova" },
  nodeTypes: ["logic.condition", "notify.email"],
  steps: [],
  forkCount: 40,
  publishedAt: "2026-09-05T10:00:00.000Z",
};
const all = [curated, mine, theirs];

describe("browseListings", () => {
  test("newest puts published flows first, then curated examples, by date then name", () => {
    const result = browseListings(all, {
      filter: "all",
      sort: "newest",
      query: "",
      username: null,
    });
    expect(result.map((item) => item.slug)).toEqual([
      "nova/beta-invites",
      "arda/airdrop-gate",
      "ticket-checkout",
    ]);
  });

  test("most forked orders by fork count descending", () => {
    const result = browseListings(all, { filter: "all", sort: "forks", query: "", username: null });
    expect(result.map((item) => item.forkCount)).toEqual([40, 12, 3]);
  });

  test("filters by author kind and by the current user", () => {
    const filter = (filter: "automator" | "community" | "mine", username: string | null) =>
      browseListings(all, { filter, sort: "name", query: "", username }).map((item) => item.slug);
    expect(filter("automator", null)).toEqual(["ticket-checkout"]);
    expect(filter("community", null)).toEqual(["arda/airdrop-gate", "nova/beta-invites"]);
    expect(filter("mine", "arda")).toEqual(["arda/airdrop-gate"]);
    expect(filter("mine", null)).toEqual([]);
  });

  test("matches the query against name, description and author", () => {
    const search = (query: string) =>
      browseListings(all, { filter: "all", sort: "name", query, username: null }).map(
        (item) => item.slug,
      );
    expect(search("  TICKET ")).toEqual(["ticket-checkout"]);
    expect(search("email")).toEqual(["nova/beta-invites"]);
    expect(search("@nova")).toEqual(["nova/beta-invites"]);
    expect(search("automator")).toEqual(["ticket-checkout"]);
    expect(search("nothing here")).toEqual([]);
  });
});

test("authorLabel and isOwnListing", () => {
  expect(authorLabel(curated.author)).toBe("Automator");
  expect(authorLabel(mine.author)).toBe("@arda");
  expect(isOwnListing(mine, "arda")).toBe(true);
  expect(isOwnListing(mine, "nova")).toBe(false);
  expect(isOwnListing(curated, "arda")).toBe(false);
});

test("listingCategories reads categories off node types and the browser filters by them", () => {
  expect(listingCategories({ nodeTypes: ["screen.form", "notify.discord"] })).toEqual([
    "mini-app",
    "notifications",
  ]);
  expect(listingCategories({ nodeTypes: ["usdc.payout", "ai.agent", "logic.wait"] })).toEqual([
    "ai",
    "onchain",
    "logic",
  ]);
  expect(listingCategories({ nodeTypes: ["trigger.manual"] })).toEqual([]);
  const onchain = browseListings(all, {
    filter: "all",
    sort: "name",
    query: "",
    username: null,
    category: "onchain",
  });
  expect(onchain.map((item) => item.slug)).toEqual(["arda/airdrop-gate", "ticket-checkout"]);
  expect(
    browseListings(all, {
      filter: "all",
      sort: "name",
      query: "notifications",
      username: null,
    }).map((item) => item.slug),
  ).toEqual(["nova/beta-invites"]);
});
