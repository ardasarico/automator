"use client";

import { Input } from "@automator/ui/input";
import { RiSearchLine } from "@remixicon/react";
import type { FlowNodeType } from "@automator/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  catalog,
  catalogGroups,
  searchCatalog,
  type CatalogEntry,
  type CatalogSection,
} from "./catalog";
import { CatalogIconMark } from "./catalog-icon";
import styles from "./flow-builder.module.css";

function allSections(): CatalogSection[] {
  return catalogGroups.flatMap((group) => {
    const entries = catalog.filter((entry) => entry.group === group.id);
    return entries.length === 0 ? [] : [{ key: group.id, label: group.label, entries }];
  });
}

function sectionsFor(query: string, accepts: (entry: CatalogEntry) => boolean): CatalogSection[] {
  const sections = query.trim() === "" ? allSections() : searchCatalog(query);
  return sections.flatMap((section) => {
    const entries = section.entries.filter(accepts);
    return entries.length === 0 ? [] : [{ ...section, entries }];
  });
}

/**
 * Catalog picker anchored to a point on the canvas. Used when a connection is dropped on
 * empty space, so the picked node arrives already wired to the port it was dragged from.
 */
export function NodePicker({
  label,
  position,
  accepts = () => true,
  onPick,
  onClose,
}: {
  label: string;
  position: { x: number; y: number };
  accepts?: (entry: CatalogEntry) => boolean;
  onPick: (type: FlowNodeType) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const sections = useMemo(() => sectionsFor(query, accepts), [accepts, query]);
  const entries = useMemo(() => sections.flatMap((section) => section.entries), [sections]);
  const current = entries[Math.min(active, entries.length - 1)];

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={container}
      role="dialog"
      aria-label={label}
      className={styles.nodePicker}
      style={{ left: position.x, top: position.y }}
    >
      <div className={styles.nodePickerSearch}>
        <div className={styles.paletteSearch}>
          <RiSearchLine aria-hidden="true" className={styles.paletteSearchIcon} />
          <Input
            autoFocus
            size="sm"
            type="search"
            aria-label="Search nodes"
            placeholder="Search nodes"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((index) => (entries.length === 0 ? 0 : (index + 1) % entries.length));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((index) =>
                  entries.length === 0 ? 0 : (index - 1 + entries.length) % entries.length,
                );
              } else if (event.key === "Enter" && current) {
                event.preventDefault();
                onPick(current.type);
              }
            }}
          />
        </div>
      </div>
      <div className={styles.nodePickerList}>
        {entries.length === 0 ? (
          <p className={styles.nodePickerEmpty} role="status">
            No node matches “{query.trim()}”.
          </p>
        ) : (
          sections.map((section) => (
            <section key={section.key} className={styles.paletteGroup} aria-label={section.label}>
              <p className={styles.paletteGroupLabel}>{section.label}</p>
              {section.entries.map((entry) => (
                <button
                  key={entry.type}
                  type="button"
                  className={styles.paletteItem}
                  data-active={entry.type === current?.type || undefined}
                  onMouseEnter={() => setActive(entries.indexOf(entry))}
                  onClick={() => onPick(entry.type)}
                >
                  <span className={styles.nodeIcon} data-category={entry.category}>
                    <CatalogIconMark icon={entry.icon} />
                  </span>
                  <span className={styles.paletteItemText}>
                    <span className={styles.paletteItemLabel}>{entry.label}</span>
                    <span className={styles.paletteItemDescription}>{entry.description}</span>
                  </span>
                </button>
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
