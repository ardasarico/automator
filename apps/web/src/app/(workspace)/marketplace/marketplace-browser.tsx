"use client";

import { Button } from "@automator/ui/button";
import { EmptyStateIllustration } from "@automator/ui/empty-state-illustration";
import { Input } from "@automator/ui/input";
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@automator/ui/menu";
import {
  segmentedControlItemVariants,
  segmentedControlRootClassName,
} from "@automator/ui/segmented-control";
import { RiArrowDownSLine, RiCompass3Line, RiSearchLine } from "@remixicon/react";
import { useState } from "react";
import { WorkspaceBreadcrumbs } from "../../../components/workspace-breadcrumbs";
import {
  browseListings,
  listingCategoryLabels,
  listingFilterLabels,
  listingSortLabels,
  type ListingCategory,
  type ListingFilter,
  type ListingSort,
  type MarketplaceItem,
} from "../../../marketplace/listing";
import { ListingCard } from "./listing-card";
import styles from "./marketplace.module.css";

const filters = Object.keys(listingFilterLabels) as ListingFilter[];
const categories = Object.keys(listingCategoryLabels) as ListingCategory[];
const sorts = Object.keys(listingSortLabels) as ListingSort[];

/** What an empty result means for each filter, so the copy names the real situation. */
const emptyCopy: Record<ListingFilter, { title: string; description: string }> = {
  all: {
    title: "No flows yet",
    description: "Flows shared by Automator and the community appear here.",
  },
  automator: {
    title: "No curated flows yet",
    description: "Examples published by Automator appear here.",
  },
  community: {
    title: "No community flows yet",
    description: "Flows published by other users appear here.",
  },
  mine: {
    title: "You haven't published a flow yet",
    description: "Flows you publish appear here, where you can update or unpublish them.",
  },
};

export function MarketplaceBrowser({
  listings,
  username,
}: {
  listings: readonly MarketplaceItem[];
  /** The signed-in user's username, for the "Yours" filter. */
  username: string | null;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ListingFilter>("all");
  const [sort, setSort] = useState<ListingSort>("newest");
  const [category, setCategory] = useState<ListingCategory | null>(null);
  const visible = browseListings(listings, { filter, sort, query, username, category });
  const searching = query.trim().length > 0 || category !== null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className="min-w-0">
          <WorkspaceBreadcrumbs current="Marketplace" />
          <p className={styles.intro}>
            Flows shared by Automator and the community. Fork one to make it yours.
          </p>
        </div>
      </header>
      <section aria-label="Shared flows">
        <div className={styles.toolbar}>
          <div className={styles.search}>
            <RiSearchLine aria-hidden="true" />
            <Input
              unstyled
              type="search"
              aria-label="Search the marketplace"
              placeholder="Search flows…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 [&_input]:px-0"
            />
          </div>
          <div className={styles.toolbarActions}>
            <div role="group" aria-label="Show flows" className={segmentedControlRootClassName}>
              {filters.map((value) => (
                <Button
                  key={value}
                  variant="ghost"
                  className={segmentedControlItemVariants({ state: "pressed" })}
                  data-pressed={filter === value ? "" : undefined}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {listingFilterLabels[value]}
                </Button>
              ))}
            </div>
            <Menu>
              <MenuTrigger render={<Button variant="outline" />}>
                {listingSortLabels[sort]}
                <RiArrowDownSLine aria-hidden="true" />
              </MenuTrigger>
              <MenuPopup align="end">
                <MenuRadioGroup
                  value={sort}
                  onValueChange={(next) => setSort(next as ListingSort)}
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
        <div className={styles.categories} role="group" aria-label="Category">
          <Button
            variant={category === null ? "secondary" : "ghost"}
            size="xs"
            aria-pressed={category === null}
            onClick={() => setCategory(null)}
          >
            All categories
          </Button>
          {categories.map((value) => (
            <Button
              key={value}
              variant={category === value ? "secondary" : "ghost"}
              size="xs"
              aria-pressed={category === value}
              onClick={() => setCategory((current) => (current === value ? null : value))}
            >
              {listingCategoryLabels[value]}
            </Button>
          ))}
        </div>
        <p className="sr-only" role="status">
          {visible.length === 1 ? "1 flow found" : `${visible.length} flows found`}
        </p>
        {visible.length === 0 ? (
          searching ? (
            <div className={styles.empty}>
              <EmptyStateIllustration icon={<RiSearchLine />} />
              <h2 className="mt-6 text-panel">No matching flows</h2>
              <p className="mt-3 text-body text-muted-foreground">
                Try another name, or clear your search.
              </p>
              <Button
                variant="outline"
                className="mt-6"
                onClick={() => {
                  setQuery("");
                  setCategory(null);
                }}
              >
                Clear search
              </Button>
            </div>
          ) : (
            <div className={styles.empty}>
              <EmptyStateIllustration icon={<RiCompass3Line />} />
              <h2 className="mt-6 text-panel text-balance">{emptyCopy[filter].title}</h2>
              <p className="mt-3 max-w-sm text-body text-pretty text-muted-foreground">
                {emptyCopy[filter].description}
              </p>
            </div>
          )
        ) : (
          <ul className={styles.grid}>
            {visible.map((listing) => (
              <li key={`${listing.author.kind}:${listing.slug}`}>
                <ListingCard listing={listing} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
