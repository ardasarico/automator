"use client";

import { Button } from "@automator/ui/button";
import { Input } from "@automator/ui/input";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@automator/ui/tooltip";
import {
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiLayoutGridLine,
  RiSearchLine,
} from "@remixicon/react";
import { useId, useState, type DragEvent } from "react";
import {
  catalogGroups,
  getCatalogGroupSections,
  listCatalogGroups,
  searchCatalog,
  type CatalogEntry,
  type CatalogGroupId,
  type CatalogGroupSummary,
  type CatalogSection,
} from "./catalog";
import { CatalogIconMark } from "./catalog-icon";
import { nodeTypeMime, useAddNodeAtCenter } from "./flow-canvas";
import styles from "./flow-builder.module.css";

type View = "list" | "grid";

/** Click adds at the viewport centre; drag drops at the pointer. Both call the same store action. */
function usePaletteItem(entry: CatalogEntry) {
  const addAtCenter = useAddNodeAtCenter();
  return {
    draggable: true,
    onDragStart(event: DragEvent<HTMLButtonElement>) {
      event.dataTransfer.setData(nodeTypeMime, entry.type);
      event.dataTransfer.effectAllowed = "move";
    },
    onClick() {
      addAtCenter(entry.type);
    },
  };
}

function ListItem({ entry }: { entry: CatalogEntry }) {
  return (
    <button type="button" className={styles.paletteItem} {...usePaletteItem(entry)}>
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

function GridItem({ entry }: { entry: CatalogEntry }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<button type="button" className={styles.paletteTile} {...usePaletteItem(entry)} />}
      >
        <span className={styles.nodeIcon} data-category={entry.category}>
          <CatalogIconMark icon={entry.icon} />
        </span>
        <span className={styles.paletteTileLabel}>{entry.label}</span>
      </TooltipTrigger>
      <TooltipPopup side="bottom">{entry.description}</TooltipPopup>
    </Tooltip>
  );
}

/** Entries in sections; a section with no label renders its entries without a heading. */
function EntrySections({ sections, view }: { sections: CatalogSection[]; view: View }) {
  return sections.map((section) => (
    <section
      key={section.key}
      className={styles.paletteGroup}
      aria-label={section.label || undefined}
    >
      {section.label && <p className={styles.paletteGroupLabel}>{section.label}</p>}
      {view === "grid" ? (
        <div className={styles.paletteGrid}>
          {section.entries.map((entry) => (
            <GridItem key={entry.type} entry={entry} />
          ))}
        </div>
      ) : (
        section.entries.map((entry) => <ListItem key={entry.type} entry={entry} />)
      )}
    </section>
  ));
}

function GroupRow({ group, onOpen }: { group: CatalogGroupSummary; onOpen: () => void }) {
  return (
    <button type="button" className={styles.paletteGroupRow} onClick={onOpen}>
      <span className={styles.nodeIcon} data-group={group.id}>
        <CatalogIconMark icon={group.icon} />
      </span>
      <span className={styles.paletteItemText}>
        <span className={styles.paletteItemLabel}>{group.label}</span>
        <span className={styles.paletteItemDescription}>{group.description}</span>
      </span>
      <span className={styles.paletteGroupCount} aria-label={`${group.count} nodes`}>
        {group.count}
      </span>
      <RiArrowRightSLine aria-hidden="true" className={styles.paletteGroupChevron} />
    </button>
  );
}

/** The resting state: core groups, then integration providers, each a row that drills in. */
function GroupList({ onOpen }: { onOpen: (group: CatalogGroupId) => void }) {
  const groups = listCatalogGroups();
  const kinds = [
    { kind: "core" as const, label: "Core" },
    { kind: "integration" as const, label: "Integrations" },
  ];
  return kinds.map(({ kind, label }) => (
    <section key={kind} className={styles.paletteGroup} aria-label={label}>
      <p className={styles.paletteGroupLabel}>{label}</p>
      {groups
        .filter((group) => group.kind === kind)
        .map((group) => (
          <GroupRow key={group.id} group={group} onOpen={() => onOpen(group.id)} />
        ))}
    </section>
  ));
}

function SearchResults({
  query,
  view,
  onClear,
}: {
  query: string;
  view: View;
  onClear: () => void;
}) {
  const sections = searchCatalog(query);
  if (sections.length === 0) {
    return (
      <div className={styles.paletteEmpty}>
        <p>No nodes match.</p>
        <Button variant="link" size="xs" onClick={onClear}>
          Clear search
        </Button>
      </div>
    );
  }
  return <EntrySections sections={sections} view={view} />;
}

/**
 * The Nodes section of the left panel, in three states: the group list, one open group, or
 * search results across every group. Search wins while it has text; clearing it returns to
 * wherever the palette was. Everything here is component state and resets with the page.
 */
export function NodePalette() {
  const [query, setQuery] = useState("");
  const [openGroup, setOpenGroup] = useState<CatalogGroupId | null>(null);
  const [view, setView] = useState<View>("list");
  const searchId = useId();
  const searching = query.trim() !== "";
  const group = openGroup ? catalogGroups.find((entry) => entry.id === openGroup) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={styles.paletteTools}>
        <label htmlFor={searchId} className="sr-only">
          Search nodes
        </label>
        <div className={styles.paletteSearch}>
          <RiSearchLine aria-hidden="true" className={styles.paletteSearchIcon} />
          <Input
            id={searchId}
            type="search"
            size="sm"
            placeholder="Search nodes"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Grid view"
                aria-pressed={view === "grid"}
                data-pressed={view === "grid" ? "" : undefined}
                onClick={() => setView((current) => (current === "grid" ? "list" : "grid"))}
              />
            }
          >
            <RiLayoutGridLine aria-hidden="true" />
          </TooltipTrigger>
          <TooltipPopup side="bottom">Grid view</TooltipPopup>
        </Tooltip>
      </div>
      {!searching && group && (
        <div className={styles.paletteCrumb}>
          <Button
            variant="ghost"
            size="xs"
            aria-label="Back to all groups"
            onClick={() => setOpenGroup(null)}
          >
            <RiArrowLeftSLine aria-hidden="true" />
            All
          </Button>
          <span className={styles.paletteCrumbLabel}>{group.label}</span>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
        {searching ? (
          <SearchResults query={query} view={view} onClear={() => setQuery("")} />
        ) : group ? (
          <EntrySections sections={getCatalogGroupSections(group.id)} view={view} />
        ) : (
          <GroupList onOpen={setOpenGroup} />
        )}
      </div>
    </div>
  );
}
