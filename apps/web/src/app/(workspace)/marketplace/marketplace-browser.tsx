"use client";

import type { FlowSummary } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { Input } from "@automator/ui/input";
import {
  Menu,
  MenuLinkItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@automator/ui/menu";
import {
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiCompass3Line,
  RiSearchLine,
  RiUploadLine,
} from "@remixicon/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { featuredSlugs } from "../../../marketplace/curated";
import {
  browseListings,
  featuredListing,
  isListingCategory,
  isListingFilter,
  isListingSort,
  listingCategories,
  listingCategoryLabels,
  listingSections,
  listingSortLabels,
  type ListingCategory,
  type ListingFilter,
  type ListingSort,
  type MarketplaceItem,
} from "../../../marketplace/listing";
import { FeaturedListing } from "./featured-listing";
import { ListingCard } from "./listing-card";
import styles from "./marketplace.module.css";
import { EmptyState } from "../../../components/empty-state";

const categories = Object.keys(listingCategoryLabels) as ListingCategory[];
const sorts = Object.keys(listingSortLabels) as ListingSort[];

const scopeCopy: Record<Exclude<ListingFilter, "all">, { title: string; description: string }> = {
  automator: {
    title: "No curated flows yet",
    description: "Examples published by Automator appear here.",
  },
  community: {
    title: "No community flows yet",
    description: "Flows published by other people appear here.",
  },
  mine: {
    title: "You haven't published a flow yet",
    description: "Flows you publish appear here, where you can update or unpublish them.",
  },
};

/** Publishing lives inside the builder, so this picks the flow and opens the dialog there. */
function PublishAction({ flows }: { flows: readonly FlowSummary[] }) {
  if (flows.length === 0)
    return (
      <Button size="sm" variant="outline" render={<Link href="/flows" />}>
        <RiUploadLine aria-hidden="true" />
        Publish a flow
      </Button>
    );
  return (
    <Menu>
      <MenuTrigger render={<Button variant="outline" size="sm" />}>
        <RiUploadLine aria-hidden="true" />
        Publish a flow
        <RiArrowDownSLine aria-hidden="true" />
      </MenuTrigger>
      <MenuPopup align="end">
        {flows.map((flow) => (
          <MenuLinkItem key={flow.id} render={<Link href={`/flows/${flow.id}?publish=1`} />}>
            {flow.name}
          </MenuLinkItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}

export function MarketplaceBrowser({
  listings,
  username,
  flows,
}: {
  listings: readonly MarketplaceItem[];
  username: string | null;
  flows: readonly FlowSummary[];
}) {
  /*
   * Every browse control reads from the URL, so a filtered view can be linked, bookmarked and
   * navigated back to. The writes go through the history API, which Next syncs with
   * `useSearchParams` without re-running the server component that loaded the listings.
   */
  const params = useSearchParams();
  const query = params.get("q") ?? "";
  const rawFilter = params.get("show") ?? "";
  const scope: ListingFilter = isListingFilter(rawFilter) ? rawFilter : "all";
  const rawSort = params.get("sort") ?? "";
  const sort: ListingSort = isListingSort(rawSort) ? rawSort : "newest";
  const rawCategory = params.get("category") ?? "";
  const category: ListingCategory | null = isListingCategory(rawCategory) ? rawCategory : null;

  function apply(changes: Record<string, string | null>, replace = false) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    const url = next.size > 0 ? `?${next.toString()}` : location.pathname;
    // Typing must not fill the history stack; picking a filter is a step worth going back from.
    if (replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
  }

  /* The default view is the storefront; any control the reader touches turns it into a catalog. */
  const browsing = query.trim().length > 0 || category !== null || scope !== "all";
  const counts = new Map(
    categories.map((value) => [
      value,
      listings.filter((listing) => listingCategories(listing).includes(value)).length,
    ]),
  );

  const head = (
    <header className={styles.head}>
      <h1 className={styles.title}>Marketplace</h1>
      <p className={styles.subtitle}>
        Flows shared by Automator and the community. Fork one to make it yours.
      </p>
      <div className={styles.search}>
        <RiSearchLine aria-hidden="true" />
        <Input
          unstyled
          type="search"
          aria-label="Search the marketplace"
          placeholder="Search flows, people and integrations…"
          value={query}
          onChange={(event) => apply({ q: event.target.value }, true)}
          className="min-w-0 flex-1 [&_input]:h-9 [&_input]:px-0 [&_input]:leading-9"
        />
      </div>
      <div role="group" aria-label="Filter by category" className={styles.chips}>
        <Button
          variant={category === null && scope === "all" ? "default" : "outline"}
          size="sm"
          aria-pressed={category === null && scope === "all"}
          onClick={() => apply({ category: null, show: null })}
        >
          All <span className={styles.chipCount}>{listings.length}</span>
        </Button>
        {categories.map((value) => (
          <Button
            key={value}
            variant={category === value ? "default" : "outline"}
            size="sm"
            aria-pressed={category === value}
            onClick={() => apply({ category: category === value ? null : value })}
          >
            {listingCategoryLabels[value]}{" "}
            <span className={styles.chipCount}>{counts.get(value) ?? 0}</span>
          </Button>
        ))}
      </div>
    </header>
  );

  if (browsing) {
    const visible = browseListings(listings, { filter: scope, sort, query, username, category });
    const empty = scope === "all" ? undefined : scopeCopy[scope];
    return (
      <>
        <div className={styles.corner}>
          <PublishAction flows={flows} />
        </div>
        <div className={styles.page}>
          {head}
          <section aria-label="Shared flows">
            <div className={styles.catalogBar}>
              <p className={styles.catalogCount} role="status">
                {visible.length === 1 ? "1 flow" : `${visible.length} flows`}
              </p>
              <div className={styles.catalogSort}>
                <Menu>
                  <MenuTrigger render={<Button variant="outline" size="sm" />}>
                    {listingSortLabels[sort]}
                    <RiArrowDownSLine aria-hidden="true" />
                  </MenuTrigger>
                  <MenuPopup align="end">
                    <MenuRadioGroup
                      value={sort}
                      onValueChange={(next) =>
                        apply({ sort: next === "newest" ? null : String(next) })
                      }
                      aria-label="Sort flows"
                    >
                      {sorts.map((value) => (
                        <MenuRadioItem key={value} value={value}>
                          {listingSortLabels[value]}
                        </MenuRadioItem>
                      ))}
                    </MenuRadioGroup>
                  </MenuPopup>
                </Menu>
              </div>
            </div>
            {visible.length === 0 ? (
              <EmptyState
                icon={empty ? <RiCompass3Line /> : <RiSearchLine />}
                title={empty ? empty.title : "No matching flows"}
                text={empty ? empty.description : "Try another name, or clear your search."}
                action={
                  <Button
                    variant="outline"
                    onClick={() => apply({ q: null, category: null, show: null })}
                  >
                    Back to the marketplace
                  </Button>
                }
              />
            ) : (
              <ul className={styles.list}>
                {visible.map((listing) => (
                  <li key={`${listing.author.kind}:${listing.slug}`}>
                    <ListingCard listing={listing} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </>
    );
  }

  const featured = featuredListing(listings, featuredSlugs);
  const sections = listingSections(listings, { username, featuredSlug: featured?.slug });

  return (
    <>
      <div className={styles.corner}>
        <PublishAction flows={flows} />
      </div>
      <div className={styles.page}>
        {head}
        {featured && <FeaturedListing listing={featured} />}
        <div className={styles.sections}>
          {sections.map((section) => (
            <section key={section.id} className={styles.section} aria-labelledby={section.id}>
              <div className={styles.sectionHead}>
                <h2 id={section.id} className="text-label">
                  {section.title}
                </h2>
                <span className={styles.sectionCount}>{section.listings.length}</span>
                {section.listings.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={styles.sectionMore}
                    onClick={() => apply({ show: section.id })}
                  >
                    See all
                    <RiArrowRightSLine aria-hidden="true" />
                  </Button>
                )}
              </div>
              {section.listings.length === 0 ? (
                <div className={styles.invite}>
                  <p className={styles.inviteText}>
                    Nobody has published a flow yet. Publish one of yours and it shows up here, for
                    anyone to fork.
                  </p>
                  <PublishAction flows={flows} />
                </div>
              ) : (
                <ul className={styles.list}>
                  {section.listings.map((listing) => (
                    <li key={`${listing.author.kind}:${listing.slug}`}>
                      <ListingCard listing={listing} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
