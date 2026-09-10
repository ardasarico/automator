"use client";

import type { DataTable } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { Input } from "@automator/ui/input";
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@automator/ui/menu";
import { RiAddLine, RiArrowDownSLine, RiSearchLine, RiTableLine } from "@remixicon/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "../../../components/empty-state";
import { PageFrame } from "../../../components/page-frame";
import flowStyles from "../flows/flows.module.css";
import { ColumnTypeIcon, columnTypeLabel } from "./column-types";
import styles from "./data.module.css";
import { TableDialog } from "./table-dialog";

type TableSort = "updated" | "name";

const sortLabels: Record<TableSort, string> = { updated: "Last edited", name: "Name A–Z" };

const dateFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** How many columns a card shows before it stops: enough to recognise a table, not to read it. */
const shownColumns = 4;

function TableCard({ table }: { table: DataTable }) {
  const shown = table.columns.slice(0, shownColumns);
  const rest = table.columns.length - shown.length;
  return (
    <article className={styles.tableCard}>
      <div className={styles.cardSchema}>
        {shown.length === 0 ? (
          <p className={styles.cardNoColumns}>No columns yet</p>
        ) : (
          shown.map((column) => (
            <p key={column.id} className={styles.cardColumn}>
              <ColumnTypeIcon type={column.type} />
              <span className={styles.cardColumnName}>{column.name}</span>
              <span className={styles.cardColumnType}>{columnTypeLabel(column.type)}</span>
            </p>
          ))
        )}
        {rest > 0 && (
          <p className={styles.cardNoColumns}>
            {rest === 1 ? "1 more column" : `${rest} more columns`}
          </p>
        )}
      </div>
      <div className={styles.cardBody}>
        <h3 className={styles.cardName}>
          <Link
            href={`/data/${encodeURIComponent(table.id)}`}
            className={styles.cardLink}
            aria-label={`${table.name} table`}
          >
            {table.name}
          </Link>
        </h3>
        {table.description && <p className={styles.cardDescription}>{table.description}</p>}
        <p className={styles.cardMeta}>
          {table.recordCount === 1 ? "1 record" : `${table.recordCount} records`} ·{" "}
          {table.columns.length === 1 ? "1 column" : `${table.columns.length} columns`} ·{" "}
          <time dateTime={table.updatedAt}>{dateFormat.format(new Date(table.updatedAt))}</time>
        </p>
      </div>
    </article>
  );
}

/**
 * What `/data` shows when no table is open: every table led by its own columns, so the gallery is
 * scanned by what each one holds. Opening a table hands the pane to its records.
 */
export function DataBrowser({ tables }: { tables: readonly DataTable[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<TableSort>("updated");
  const visible = tables
    .filter((table) => table.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    );

  const dialog = creating && (
    <TableDialog
      onClose={() => setCreating(false)}
      onSaved={(saved) => {
        setCreating(false);
        /* The rail is the layout's, and a push between the layout's own children does not
         * re-run the layout, so the new table would reach the pane and not the rail. The
         * refresh has to follow the push: called first, the navigation supersedes it and the
         * rail stays stale. */
        router.push(`/data/${encodeURIComponent(saved.id)}`);
        router.refresh();
      }}
    />
  );

  if (tables.length === 0)
    return (
      <PageFrame title="Data">
        <EmptyState
          icon={<RiTableLine />}
          titleId="data-empty-title"
          title="Create your first table"
          text="A table holds records with typed columns. Your flows can look them up, add to them and change them while they run."
          action={
            <Button onClick={() => setCreating(true)}>
              <RiAddLine aria-hidden="true" />
              Create a table
            </Button>
          }
        />
        {dialog}
      </PageFrame>
    );

  return (
    <PageFrame
      title="Data"
      actions={
        <>
          <div className={flowStyles.search}>
            <RiSearchLine aria-hidden="true" />
            <Input
              unstyled
              type="search"
              aria-label="Search tables"
              placeholder="Search tables…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 [&_input]:h-7 [&_input]:px-0 [&_input]:leading-7"
            />
          </div>
          <Button size="sm" onClick={() => setCreating(true)}>
            <RiAddLine aria-hidden="true" />
            New table
          </Button>
        </>
      }
      toolbar={
        <Menu>
          <MenuTrigger render={<Button variant="outline" size="sm" />}>
            {sortLabels[sort]}
            <RiArrowDownSLine aria-hidden="true" />
          </MenuTrigger>
          <MenuPopup align="start">
            <MenuRadioGroup
              value={sort}
              onValueChange={(next) => setSort(next as TableSort)}
              aria-label="Sort tables"
            >
              <MenuRadioItem value="updated">{sortLabels.updated}</MenuRadioItem>
              <MenuRadioItem value="name">{sortLabels.name}</MenuRadioItem>
            </MenuRadioGroup>
          </MenuPopup>
        </Menu>
      }
    >
      <section aria-label="Your tables">
        <p className="sr-only" role="status">
          {visible.length === 1 ? "1 table found" : `${visible.length} tables found`}
        </p>
        {visible.length === 0 ? (
          <EmptyState
            icon={<RiSearchLine />}
            title="No matching tables"
            text="Try another name, or clear your search."
            action={
              <Button variant="outline" onClick={() => setQuery("")}>
                Clear search
              </Button>
            }
          />
        ) : (
          <div className={styles.tableGrid}>
            {visible.map((table) => (
              <TableCard key={table.id} table={table} />
            ))}
          </div>
        )}
      </section>
      {dialog}
    </PageFrame>
  );
}
