"use client";

import type { DataColumn, DataRecord, DataTable } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { Input } from "@automator/ui/input";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@automator/ui/menu";
import {
  RiAddLine,
  RiCloseLine,
  RiErrorWarningLine,
  RiMoreLine,
  RiSearchLine,
  RiTableLine,
} from "@remixicon/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import flowStyles from "../../flows/flows.module.css";
import { EmptyState } from "../../../../components/empty-state";
import { PageFrame } from "../../../../components/page-frame";
import { humanize } from "../../../../components/schema-form";
import styles from "../data.module.css";
import { TableDialog } from "../table-dialog";
import { DeleteTableDialog } from "./delete-table-dialog";
import { RecordFilterDialog } from "./record-filter-dialog";
import { RecordGrid } from "./record-grid";
import { recordsHref, type RecordFilter, type RecordQuery } from "./record-query";

/** How long a reader has to stop typing before the search reaches the server. */
const searchDelay = 350;

function columnName(table: DataTable, id: string): string {
  return table.columns.find((column) => column.id === id)?.name ?? id;
}

function filterLabel(table: DataTable, filter: RecordFilter): string {
  const name = columnName(table, filter.column);
  const condition = humanize(filter.operator).toLowerCase();
  return filter.value ? `${name} ${condition} ${filter.value}` : `${name} ${condition}`;
}

/**
 * The records of one table, with the controls that narrow them. `records` is `null` when the list
 * itself could not load, which leaves the page and its table actions usable.
 *
 * Narrowing and paging are two different things and the page says which one it is doing: an
 * unfiltered table pages by cursor, while a filtered, sorted or searched one answers a single
 * page of matches — the sort runs over a stored value the cursor cannot follow.
 */
export function RecordBrowser({
  table,
  records,
  query,
  truncated,
  nextHref,
  latestHref,
  retryHref,
  retryCursor,
}: {
  table: DataTable;
  records: readonly DataRecord[] | null;
  query: RecordQuery;
  truncated?: boolean;
  nextHref?: string;
  latestHref?: string;
  /** The page's own path, without a query: a GET form drops the query of its action. */
  retryHref: string;
  retryCursor?: string;
}) {
  const router = useRouter();
  const [editingColumns, setEditingColumns] = useState(false);
  const [deletingTable, setDeletingTable] = useState(false);
  const [filtering, setFiltering] = useState<DataColumn | null>(null);
  const [search, setSearch] = useState(query.search ?? "");
  /* Cell edits answer with the stored record, so the row shows it without refetching the page. */
  const [edited, setEdited] = useState<Record<string, DataRecord>>({});

  /*
   * The URL is the source of truth: a Back that undoes a search has to put the box back too.
   * Adjusting during render rather than in an effect keeps that from costing a second paint.
   */
  const [urlSearch, setUrlSearch] = useState(query.search ?? "");
  if (urlSearch !== (query.search ?? "")) {
    setUrlSearch(query.search ?? "");
    setSearch(query.search ?? "");
  }

  useEffect(() => {
    const current = query.search ?? "";
    if (search.trim() === current) return;
    const timer = setTimeout(() => {
      router.replace(
        recordsHref(table.id, { ...query, cursor: undefined, search: search.trim() || undefined }),
        { scroll: false },
      );
    }, searchDelay);
    return () => clearTimeout(timer);
  }, [search, query, router, table.id]);

  /** Every navigation the toolbar makes starts a fresh page: a cursor from the old view is gone. */
  const go = (next: Partial<RecordQuery>) =>
    router.push(recordsHref(table.id, { ...query, cursor: undefined, ...next }), { scroll: false });

  const applyFilter = (filter: RecordFilter) => {
    setFiltering(null);
    go({ filters: [...query.filters.filter((one) => one.column !== filter.column), filter] });
  };

  const shown = (records ?? []).map((record) => edited[record.id] ?? record);
  const narrowed = query.filters.length > 0 || query.sort !== undefined || query.search;

  return (
    <PageFrame
      title={table.name}
      parents={[{ label: "Data", href: "/data" }]}
      actions={
        <>
          <div className={flowStyles.search}>
            <RiSearchLine aria-hidden="true" />
            <Input
              unstyled
              type="search"
              aria-label={`Search ${table.name}`}
              placeholder="Search records…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-w-0 flex-1 [&_input]:h-7 [&_input]:px-0 [&_input]:leading-7"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditingColumns(true)}>
            Edit columns
          </Button>
          {/* Deleting a table is rare and destructive; the primary row is for the daily work,
           * and with a record open beside the grid there is no width to spare either. */}
          <Menu>
            <MenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="Table actions" />}
            >
              <RiMoreLine aria-hidden="true" />
            </MenuTrigger>
            <MenuPopup align="end">
              <MenuItem onClick={() => setDeletingTable(true)}>Delete table</MenuItem>
            </MenuPopup>
          </Menu>
          <Button size="sm" render={<Link href={`/data/${encodeURIComponent(table.id)}/new`} />}>
            <RiAddLine aria-hidden="true" />
            Add record
          </Button>
        </>
      }
      toolbar={
        <div className={styles.chips}>
          {query.filters.map((filter) => (
            <span key={filter.column} className={styles.chip}>
              {filterLabel(table, filter)}
              <button
                type="button"
                className={styles.chipClear}
                aria-label={`Remove the filter on ${columnName(table, filter.column)}`}
                onClick={() =>
                  go({ filters: query.filters.filter((one) => one.column !== filter.column) })
                }
              >
                <RiCloseLine aria-hidden="true" />
              </button>
            </span>
          ))}
          {query.sort && (
            <span className={styles.chip}>
              {`Sorted by ${columnName(table, query.sort.column)}, ${
                query.sort.direction === "asc" ? "ascending" : "descending"
              }`}
              <button
                type="button"
                className={styles.chipClear}
                aria-label="Remove the sort"
                onClick={() => go({ sort: undefined })}
              >
                <RiCloseLine aria-hidden="true" />
              </button>
            </span>
          )}
          {query.filters.length === 0 && !query.sort && !query.search && (
            <span className="text-caption text-muted-foreground">
              Sort and filter from a column&rsquo;s header.
            </span>
          )}
          {records !== null && (
            <span className={styles.note}>
              {truncated
                ? "Showing the first 100 matches"
                : narrowed
                  ? shown.length === 1
                    ? "1 match"
                    : `${shown.length} matches`
                  : `${table.recordCount === 1 ? "1 record" : `${table.recordCount} records`}`}
            </span>
          )}
        </div>
      }
    >
      {table.description && (
        <p className="mb-4 max-w-2xl text-caption text-pretty text-muted-foreground">
          {table.description}
        </p>
      )}
      <section aria-label="Records">
        {records === null ? (
          <EmptyState
            status
            icon={<RiErrorWarningLine />}
            title="Records could not load"
            text="The record list is temporarily unavailable. Try again to read this table."
            action={
              <form action={retryHref} method="get">
                {retryCursor && <input type="hidden" name="cursor" value={retryCursor} />}
                <Button variant="outline" type="submit">
                  Try again
                </Button>
              </form>
            }
          />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={narrowed ? <RiSearchLine /> : <RiTableLine />}
            title={
              narrowed ? "No records match" : latestHref ? "No more records" : "No records yet"
            }
            text={
              narrowed
                ? "Nothing in this table matches what you asked for. Clear the filters to see everything."
                : latestHref
                  ? "There is nothing on this page. Return to the first page to see this table's records."
                  : "Add a record here, or let a flow write one with a Create record node."
            }
            action={
              narrowed ? (
                <Button
                  variant="outline"
                  render={<Link href={recordsHref(table.id)} scroll={false} />}
                >
                  Clear filters
                </Button>
              ) : latestHref ? (
                <Button variant="outline" render={<Link href={latestHref} />}>
                  Back to the first page
                </Button>
              ) : (
                <Button render={<Link href={`/data/${encodeURIComponent(table.id)}/new`} />}>
                  <RiAddLine aria-hidden="true" />
                  Add record
                </Button>
              )
            }
          />
        ) : (
          <RecordGrid
            table={table}
            records={shown}
            query={query}
            onSaved={(record) => setEdited((current) => ({ ...current, [record.id]: record }))}
            onFilter={setFiltering}
            onSort={(column, direction) => go({ sort: { column: column.id, direction } })}
          />
        )}
        {(latestHref || nextHref) && (
          <nav aria-label="Record pages" className="mt-6 flex flex-wrap justify-center gap-3">
            {latestHref && (
              <Button variant="outline" render={<Link href={latestHref} />}>
                First page
              </Button>
            )}
            {nextHref && (
              <Button variant="outline" render={<Link href={nextHref} />}>
                Older records
              </Button>
            )}
          </nav>
        )}
      </section>
      {filtering && (
        <RecordFilterDialog
          column={filtering}
          current={query.filters.find((one) => one.column === filtering.id)}
          onClose={() => setFiltering(null)}
          onApply={applyFilter}
        />
      )}
      {editingColumns && (
        <TableDialog
          table={table}
          onClose={() => setEditingColumns(false)}
          onSaved={() => {
            setEditingColumns(false);
            router.refresh();
          }}
        />
      )}
      {deletingTable && <DeleteTableDialog table={table} onClose={() => setDeletingTable(false)} />}
    </PageFrame>
  );
}
