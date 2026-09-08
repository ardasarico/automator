import { RiGitForkLine } from "@remixicon/react";
import Link from "next/link";
import { authorLabel, type MarketplaceItem } from "../../../marketplace/listing";
import { FlowActionButton } from "../../../flows/action-button";
import { createFlowAction, forkFlowAction } from "../../../flows/actions";
import { ListingMarks } from "../../../marketplace/listing-marks";
import styles from "./marketplace.module.css";

const forkCountFormat = new Intl.NumberFormat("en");

/** One marketplace listing: marks, name, description, then who published it and a fork action. */
export function ListingCard({ listing }: { listing: MarketplaceItem }) {
  const titleId = `listing-${listing.author.kind}-${listing.slug}-title`;
  const forks = listing.author.kind === "user" ? listing.forkCount : null;
  return (
    <article className={styles.card} aria-labelledby={titleId}>
      <div className={styles.cardTop}>
        <ListingMarks nodeTypes={listing.nodeTypes} />
        {forks !== null && (
          <p className={styles.cardMeta}>
            <RiGitForkLine aria-hidden="true" />
            <span>
              {forkCountFormat.format(forks)} {forks === 1 ? "fork" : "forks"}
            </span>
          </p>
        )}
      </div>
      <h3 id={titleId} className={`${styles.cardTitle} text-label`}>
        <Link href={`/marketplace/${encodeURIComponent(listing.slug)}`} className={styles.cardLink}>
          {listing.name}
        </Link>
      </h3>
      <p className={styles.cardDescription}>{listing.description}</p>
      <div className={styles.cardFooter}>
        <p className={styles.cardMeta}>
          <span>{authorLabel(listing.author)}</span>
        </p>
        <FlowActionButton
          className="relative z-10"
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
          Fork flow
        </FlowActionButton>
      </div>
    </article>
  );
}
