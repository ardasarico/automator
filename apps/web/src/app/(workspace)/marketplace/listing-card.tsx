import { Button } from "@automator/ui/button";
import { RiGitForkLine } from "@remixicon/react";
import Link from "next/link";
import { authorLabel, forkHref, type MarketplaceItem } from "../../../marketplace/listing";
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
        <Link href={`/marketplace/${listing.slug}`} className={styles.cardLink}>
          {listing.name}
        </Link>
      </h3>
      <p className={styles.cardDescription}>{listing.description}</p>
      <div className={styles.cardFooter}>
        <p className={styles.cardMeta}>
          <span>{authorLabel(listing.author)}</span>
        </p>
        <Button
          className="relative z-10"
          variant="outline"
          size="sm"
          render={<Link href={forkHref(listing)} />}
          aria-label={`Fork flow: ${listing.name}`}
        >
          <RiGitForkLine aria-hidden="true" />
          Fork flow
        </Button>
      </div>
    </article>
  );
}
