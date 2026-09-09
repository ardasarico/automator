import { getCatalogEntry } from "../builder/catalog";
import { CatalogIconMark } from "../builder/catalog-icon";
import styles from "./listing-marks.module.css";
import type { MarketplaceItem } from "./listing";

/* Enough to say what a flow touches without the row wrapping; the rest becomes a count. */
const shown = 3;

/**
 * What a listing is built from. A row of bare glyphs was readable only to a screen reader, so
 * each one now carries the name a person is actually scanning for.
 */
export function ListingMarks({ nodeTypes }: { nodeTypes: MarketplaceItem["nodeTypes"] }) {
  const entries = nodeTypes.map((type) => getCatalogEntry(type));
  const rest = entries.length - shown;
  return (
    <ul className={styles.marks} aria-label="Nodes used">
      {entries.slice(0, shown).map((entry) => (
        <li key={entry.type} className={styles.mark}>
          <CatalogIconMark icon={entry.icon} />
          <span className={styles.markLabel}>{entry.label}</span>
        </li>
      ))}
      {rest > 0 && (
        <li
          className={styles.more}
          title={entries
            .slice(shown)
            .map((e) => e.label)
            .join(", ")}
        >
          +{rest}
        </li>
      )}
    </ul>
  );
}
