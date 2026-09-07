import { getCatalogEntry } from "../builder/catalog";
import { CatalogIconMark } from "../builder/catalog-icon";
import type { MarketplaceItem } from "./listing";

/** The node types a listing highlights, drawn with their catalog icons and named on hover. */
export function ListingMarks({ nodeTypes }: { nodeTypes: MarketplaceItem["nodeTypes"] }) {
  return (
    <ul className="flex gap-2" aria-label="Nodes used">
      {nodeTypes.map((type) => {
        const entry = getCatalogEntry(type);
        return (
          <li
            key={type}
            title={entry.label}
            className="flex size-7 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground"
          >
            <CatalogIconMark icon={entry.icon} label={entry.label} />
          </li>
        );
      })}
    </ul>
  );
}
