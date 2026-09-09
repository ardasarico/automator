import { RiGitForkLine } from "@remixicon/react";
import Link from "next/link";
import { FlowActionButton } from "../../../flows/action-button";
import { createFlowAction, forkFlowAction } from "../../../flows/actions";
import { FlowMiniature } from "../../../flows/flow-miniature";
import { tileView } from "../../../flows/miniature-geometry";
import type { MarketplaceItem } from "../../../marketplace/listing";
import { ListingAuthorLine } from "../../../marketplace/listing-author";
import { ListingSignal } from "../../../marketplace/listing-signal";
import styles from "./marketplace.module.css";

/**
 * One listing, as a row: the flow's own shape on the left, then what it is called, what it does,
 * and who made it. The shape is drawn from the stored node positions, so a branching flow and a
 * straight one are told apart before the name is read.
 *
 * Fork stays hidden until the card is hovered or focused — opening the listing is the ordinary
 * act, forking is the deliberate one. It is hidden with opacity rather than `display`, so it
 * keeps its place in the tab order and appears when tabbed to.
 */
export function ListingCard({ listing }: { listing: MarketplaceItem }) {
  const titleId = `listing-${listing.author.kind}-${listing.slug}-title`;
  return (
    <article className={styles.card} aria-labelledby={titleId}>
      <div className={styles.cardTile}>
        {listing.outline.nodes.length > 0 && (
          <FlowMiniature outline={listing.outline} view={tileView} />
        )}
      </div>
      <div className={styles.cardBody}>
        <h3 id={titleId} className={`${styles.cardTitle} text-label`}>
          <Link
            href={`/marketplace/${encodeURIComponent(listing.slug)}`}
            className={styles.cardLink}
          >
            {listing.name}
          </Link>
        </h3>
        <p className={styles.cardDescription}>{listing.description}</p>
        <div className={styles.cardFoot}>
          <ListingAuthorLine author={listing.author} size={18} />
          <ListingSignal listing={listing} />
        </div>
      </div>
      <div className={styles.cardFork}>
        <FlowActionButton
          variant="outline"
          size="sm"
          action={
            listing.author.kind === "automator"
              ? createFlowAction.bind(null, { example: listing.slug })
              : forkFlowAction.bind(null, listing.slug)
          }
          aria-label={`Fork flow: ${listing.name}`}
        >
          <RiGitForkLine aria-hidden="true" />
          Fork
        </FlowActionButton>
      </div>
    </article>
  );
}
