import type { FlowDocument, FlowNodeType, MarketplaceListing } from "@automator/contracts";

export type ListingAuthor =
  | { kind: "automator" }
  | { kind: "user"; name: string; username: string };

export type ListingStep = { name: string; description: string };

export type MarketplaceItem = {
  slug: string;
  name: string;
  description: string;
  author: ListingAuthor;
  nodeTypes: readonly FlowNodeType[];
  steps: readonly ListingStep[];
  forkCount: number;
  publishedAt?: string;
  document?: FlowDocument;
};

export type ListingCategory = "mini-app" | "ai" | "onchain" | "notifications" | "logic";

export const listingCategoryLabels: Record<ListingCategory, string> = {
  "mini-app": "Mini-apps",
  ai: "AI",
  onchain: "Onchain",
  notifications: "Notifications",
  logic: "Logic",
};

const categoryOf = (type: FlowNodeType): ListingCategory | undefined => {
  if (type.startsWith("screen.") || type === "trigger.miniapp-open") return "mini-app";
  if (type.startsWith("ai.")) return "ai";
  if (type.startsWith("onchain.") || type.startsWith("usdc.") || type.startsWith("privy."))
    return "onchain";
  if (type.startsWith("notify.")) return "notifications";
  if (type.startsWith("logic.")) return "logic";
  return undefined;
};

export function listingCategories(item: Pick<MarketplaceItem, "nodeTypes">): ListingCategory[] {
  const found = new Set<ListingCategory>();
  for (const type of item.nodeTypes) {
    const category = categoryOf(type);
    if (category) found.add(category);
  }
  return (Object.keys(listingCategoryLabels) as ListingCategory[]).filter((c) => found.has(c));
}

export function fromListing(
  listing: MarketplaceListing,
  steps: readonly ListingStep[] = [],
  document?: FlowDocument,
) {
  return {
    slug: listing.slug,
    name: listing.name,
    description: listing.description,
    author: { kind: "user", name: listing.author.name, username: listing.author.username },
    nodeTypes: listing.nodeTypes,
    steps,
    forkCount: listing.forkCount,
    publishedAt: listing.publishedAt,
    ...(document ? { document } : {}),
  } satisfies MarketplaceItem;
}

export type ListingFilter = "all" | "automator" | "community" | "mine";
export type ListingSort = "newest" | "forks" | "name";

export const listingFilterLabels: Record<ListingFilter, string> = {
  all: "All",
  automator: "By Automator",
  community: "Community",
  mine: "Yours",
};

export const listingSortLabels: Record<ListingSort, string> = {
  newest: "Newest",
  forks: "Most forked",
  name: "Name A–Z",
};

/* The browse controls live in the URL, so these narrow what a query string hands back. */
export function isListingFilter(value: string): value is ListingFilter {
  return value in listingFilterLabels;
}

export function isListingSort(value: string): value is ListingSort {
  return value in listingSortLabels;
}

export function isListingCategory(value: string): value is ListingCategory {
  return value in listingCategoryLabels;
}

export function authorLabel(author: ListingAuthor): string {
  return author.kind === "automator" ? "Automator" : `@${author.username}`;
}

export function isOwnListing(listing: MarketplaceItem, username: string | null): boolean {
  return listing.author.kind === "user" && listing.author.username === username;
}

function matchesFilter(
  listing: MarketplaceItem,
  filter: ListingFilter,
  username: string | null,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "automator":
      return listing.author.kind === "automator";
    case "community":
      return listing.author.kind === "user";
    case "mine":
      return isOwnListing(listing, username);
  }
}

function matchesQuery(listing: MarketplaceItem, query: string): boolean {
  if (!query) return true;
  const haystack = [
    listing.name,
    listing.description,
    authorLabel(listing.author),
    ...listing.nodeTypes,
    ...listingCategories(listing).map((category) => listingCategoryLabels[category]),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function compare(a: MarketplaceItem, b: MarketplaceItem, sort: ListingSort): number {
  switch (sort) {
    case "name":
      return a.name.localeCompare(b.name);
    case "forks":
      return b.forkCount - a.forkCount || a.name.localeCompare(b.name);
    case "newest": {
      const at = (listing: MarketplaceItem) =>
        listing.publishedAt ? Date.parse(listing.publishedAt) : Number.NEGATIVE_INFINITY;
      return at(b) - at(a) || a.name.localeCompare(b.name);
    }
  }
}

export function browseListings(
  listings: readonly MarketplaceItem[],
  options: {
    filter: ListingFilter;
    sort: ListingSort;
    query: string;
    username: string | null;
    category?: ListingCategory | null;
  },
): MarketplaceItem[] {
  const query = options.query.trim().toLowerCase();
  return listings
    .filter(
      (listing) =>
        matchesFilter(listing, options.filter, options.username) &&
        matchesQuery(listing, query) &&
        (!options.category || listingCategories(listing).includes(options.category)),
    )
    .sort((a, b) => compare(a, b, options.sort));
}
