"use client";

import type { DragEvent } from "react";
import { catalog, catalogCategories, categoryOrder, type CatalogEntry } from "./catalog";
import { CatalogIconMark } from "./catalog-icon";
import { nodeTypeMime, useAddNodeAtCenter } from "./flow-canvas";
import styles from "./flow-builder.module.css";

function PaletteItem({ entry }: { entry: CatalogEntry }) {
  const addAtCenter = useAddNodeAtCenter();

  const onDragStart = (event: DragEvent<HTMLButtonElement>) => {
    event.dataTransfer.setData(nodeTypeMime, entry.type);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <button
      type="button"
      className={styles.paletteItem}
      draggable
      onDragStart={onDragStart}
      onClick={() => addAtCenter(entry.type)}
    >
      <span className={styles.nodeIcon} data-category={entry.category}>
        <CatalogIconMark icon={entry.icon} />
      </span>
      <span className={styles.paletteItemText}>
        <span className={styles.paletteItemLabel}>{entry.label}</span>
        <span className={styles.paletteItemDescription}>{entry.description}</span>
      </span>
    </button>
  );
}

/**
 * The left panel's default body. Click adds at the viewport centre; drag drops at the pointer.
 * Both call the same store action. The panel column itself lives in `left-panel.tsx`.
 */
export function NodePalette() {
  return (
    <>
      <h2 className={styles.paletteHeading}>Add a node</h2>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {categoryOrder.map((category) => (
          <section
            key={category}
            className={styles.paletteGroup}
            aria-labelledby={`palette-group-${category}`}
          >
            <p id={`palette-group-${category}`} className={styles.paletteGroupLabel}>
              {catalogCategories[category]}
            </p>
            {catalog
              .filter((entry) => entry.category === category)
              .map((entry) => (
                <PaletteItem key={entry.type} entry={entry} />
              ))}
          </section>
        ))}
      </div>
    </>
  );
}
