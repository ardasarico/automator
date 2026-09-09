import { Button } from "@automator/ui/button";
import { RiGitForkLine } from "@remixicon/react";
import Link from "next/link";
import { FlowActionButton } from "../../../flows/action-button";
import { createFlowAction, forkFlowAction } from "../../../flows/actions";
import { FlowMiniature } from "../../../flows/flow-miniature";
import type { MarketplaceItem } from "../../../marketplace/listing";
import { ListingAuthorLine } from "../../../marketplace/listing-author";
import styles from "./marketplace.module.css";

/**
 * One pick, given the room the row cards do not have: the flow drawn at a size you can read, and
 * the two things you would do with it. Which listing this is comes from `featuredSlugs` — an
 * editorial choice, not a metric.
 */
export function FeaturedListing({ listing }: { listing: MarketplaceItem }) {
  return (
    <article className={styles.featured} aria-labelledby="featured-title">
      <div className={styles.featuredBody}>
        <p className={styles.featuredKicker}>Featured</p>
        <h2 id="featured-title" className={`${styles.featuredTitle} text-section`}>
          {listing.name}
        </h2>
        <p className={styles.featuredDescription}>{listing.description}</p>
        <ListingAuthorLine author={listing.author} size={22} />
        <div className={styles.featuredActions}>
          <FlowActionButton
            size="sm"
            action={
              listing.author.kind === "automator"
                ? createFlowAction.bind(null, { example: listing.slug })
                : forkFlowAction.bind(null, listing.slug)
            }
            aria-label={`Fork flow: ${listing.name}`}
          >
            <RiGitForkLine aria-hidden="true" />
            Fork flow
          </FlowActionButton>
          <Button
            size="sm"
            variant="outline"
            render={<Link href={`/marketplace/${encodeURIComponent(listing.slug)}`} />}
          >
            Read it
          </Button>
        </div>
      </div>
      {listing.outline.nodes.length > 0 && (
        <div className={styles.featuredShape}>
          <FlowMiniature outline={listing.outline} label={`Graph of ${listing.name}`} />
        </div>
      )}
    </article>
  );
}
