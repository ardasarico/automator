import { Badge } from "@automator/ui/badge";
import { RiGitForkLine } from "@remixicon/react";
import type { MarketplaceItem } from "./listing";
import styles from "./listing-signal.module.css";

const forkCountFormat = new Intl.NumberFormat("en");

/**
 * The one number a listing can honestly carry. A published flow counts its forks; the bundled
 * examples do not have a fork count to report, so they say what they are instead. Nothing here
 * is invented — no installs, no views, no "trending".
 */
export function ListingSignal({ listing }: { listing: MarketplaceItem }) {
  if (listing.author.kind === "automator")
    return (
      <Badge variant="secondary" size="sm">
        Example
      </Badge>
    );
  const { forkCount } = listing;
  return (
    <span className={styles.signal}>
      <RiGitForkLine aria-hidden="true" />
      <span>
        {forkCountFormat.format(forkCount)} {forkCount === 1 ? "fork" : "forks"}
      </span>
    </span>
  );
}
