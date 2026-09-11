"use client";

import type { DataColumn, DataRecord, DataTable } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { Input } from "@automator/ui/input";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@automator/ui/menu";
import {
  RiAddLine,
  RiCloseLine,
  RiDeleteBinLine,
  RiErrorWarningLine,
  RiEyeOffLine,
  RiMoreLine,
  RiSearchLine,
  RiTableLine,
} from "@remixicon/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyState } from "../../../../components/empty-state";
import { PageFrame } from "../../../../components/page-frame";
import { humanize } from "../../../../components/schema-form";
import styles from "../data.module.css";
import { TableDialog } from "../table-dialog";
import { TableSwitcher } from "../table-switcher";
import { useColumnPreferences } from "./column-preferences";
import { DeleteTableDialog } from "./delete-table-dialog";
import { DeleteColumnDialog, DeleteRecordsDialog } from "./grid-dialogs";
import { RecordFilterDialog } from "./record-filter-dialog";
import { RecordGrid, type ColumnActions } from "./record-grid";
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

/** The record the panel has open, if any: `/data/<table>/<record>`. */
function openRecordId(pathname: string): string | undefined {
  const [, section, , recordId] = pathname.split("/");
  return section === "data" && recordId ? decodeURIComponent(recordId) : undefined;
}

/** A page's records, as a set the grid can ask about in constant time. */
function idsOf(records: readonly DataRecord[]): Set<string> {
  return new Set(records.map((record) => record.id));
}

/** What the column dialog was opened for: a rename, or the blank column the grid's “+” asks for. */
type ColumnDialog = { focusColumn?: string; withNewColumn?: boolean };

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
  tables,
  records,
  query,
  truncated,
  nextHref,
  latestHref,
  retryHref,
  retryCursor,
}: {
  table: DataTable;
  /** Every table of the account: the title bar's switcher is the section's navigation. */
  tables: readonly DataTable[];
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
  const pathname = usePathname();
  const preferences = useColumnPreferences(table.id);
  const [columnDialog, setColumnDialog] = useState<ColumnDialog | null>(null);
  const [deletingTable, setDeletingTable] = useState(false);
  const [deletingColumn, setDeletingColumn] = useState<DataColumn | null>(null);
  const [deletingRecords, setDeletingRecords] = useState(false);
  const [filtering, setFiltering] = useState<DataColumn | null>(null);
  const [search, setSearch] = useState(query.search ?? "");
  /* Cell edits answer with the stored record, so the row shows it without refetching the page. */
  const [edited, setEdited] = useState<Record<string, DataRecord>>({});
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  /*
   * The URL is the source of truth: a Back that undoes a search has to put the box back too.
   * Adjusting during render rather than in an effect keeps that from costing a second paint.
   */
  const [urlSearch, setUrlSearch] = useState(query.search ?? "");
  if (urlSearch !== (query.search ?? "")) {
    setUrlSearch(query.search ?? "");
    setSearch(query.search ?? "");
  }

  /* A selection belongs to the rows it was made on: a record off this page cannot be acted on. */
  const shown = (records ?? []).map((record) => edited[record.id] ?? record);
  const onPage = idsOf(shown);
  const selectedHere = [...selected].filter((id) => onPage.has(id));
  if (selectedHere.length !== selected.size) setSelected(new Set(selectedHere));

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

  const visibleColumns = table.columns.filter((column) => !preferences.hidden.includes(column.id));
  const hiddenColumns = table.columns.filter((column) => preferences.hidden.includes(column.id));
  const narrowed = query.filters.length > 0 || query.sort !== undefined || Boolean(query.search);

  const columnActions: ColumnActions = {
    onSort: (column, direction) => go({ sort: { column: column.id, direction } }),
    onClearSort: () => go({ sort: undefined }),
    onFilter: setFiltering,
    onHide: (column) => preferences.hide(column.id),
    onRename: (column) => setColumnDialog({ focusColumn: column.id }),
    onDelete: setDeletingColumn,
    onAdd: () => setColumnDialog({ withNewColumn: true }),
    onResize: (column, width) => preferences.setWidth(column.id, width),
  };

  const countLine = truncated
    ? "The first 100 matches"
    : narrowed
      ? shown.length === 1
        ? "1 match"
        : `${shown.length} matches`
      : table.recordCount === 1
        ? "1 record"
        : `${table.recordCount} records`;

  return (
    <PageFrame
      title={<TableSwitcher tables={tables} current={table} />}
      parents={[{ label: "Data", href: "/data" }]}
      actions={
        <>
          <div className={styles.searchBox}>
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
          {/* Columns and the table itself are edited rarely; the primary row is for the daily
           * work, and with a record open beside the grid there is no width to spare either. */}
          <Menu>
            <MenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="Table actions" />}
            >
              <RiMoreLine aria-hidden="true" />
            </MenuTrigger>
            <MenuPopup align="end">
              <MenuItem onClick={() => setColumnDialog({})}>Edit columns</MenuItem>
              {hiddenColumns.length > 0 && (
                <MenuItem onClick={preferences.showAll}>
                  {hiddenColumns.length === 1
                    ? "Show 1 hidden column"
                    : `Show ${hiddenColumns.length} hidden columns`}
                </MenuItem>
              )}
              <MenuItem variant="destructive" onClick={() => setDeletingTable(true)}>
                Delete table
              </MenuItem>
            </MenuPopup>
          </Menu>
          <Button size="sm" render={<Link href={`/data/${encodeURIComponent(table.id)}/new`} />}>
            <RiAddLine aria-hidden="true" />
            Add record
          </Button>
        </>
      }
      toolbar={
        selected.size > 0 ? (
          <div className={styles.selection} role="status">
            <span className={styles.selectionCount}>
              {selected.size === 1 ? "1 record selected" : `${selected.size} records selected`}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <span className={styles.selectionSpacer} />
            <Button variant="outline" size="sm" onClick={() => setDeletingRecords(true)}>
              <RiDeleteBinLine aria-hidden="true" />
              Delete
            </Button>
          </div>
        ) : (
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
            {hiddenColumns.map((column) => (
              <button
                key={column.id}
                type="button"
                className={`${styles.chip} ${styles.chipButton}`}
                onClick={() => preferences.show(column.id)}
              >
                <RiEyeOffLine aria-hidden="true" size={14} />
                {`${column.name} hidden`}
              </button>
            ))}
            {!narrowed && hiddenColumns.length === 0 && (
              <span className={styles.hint}>
                Sort, filter and hide from a column&rsquo;s header.
              </span>
            )}
          </div>
        )
      }
    >
      <section aria-label="Records" className={styles.records}>
        {table.description && <p className={styles.tableNote}>{table.description}</p>}
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
          <>
            <RecordGrid
              table={table}
              columns={visibleColumns}
              records={shown}
              query={query}
              widths={preferences.widths}
              openRecordId={openRecordId(pathname)}
              selection={{
                selected,
                onToggle: (recordId, next) =>
                  setSelected((current) => {
                    const copy = new Set(current);
                    if (next) copy.add(recordId);
                    else copy.delete(recordId);
                    return copy;
                  }),
                onToggleAll: (next) => setSelected(next ? idsOf(shown) : new Set()),
              }}
              actions={columnActions}
              onSaved={(record) => setEdited((current) => ({ ...current, [record.id]: record }))}
            />
            <div className={styles.footer}>
              <span className={styles.footerCount}>{countLine}</span>
              {truncated && (
                <span>The order runs over stored values, which a page cursor cannot follow.</span>
              )}
              {(latestHref || nextHref) && (
                <nav aria-label="Record pages" className={styles.footerPages}>
                  {latestHref && (
                    <Button variant="outline" size="sm" render={<Link href={latestHref} />}>
                      First page
                    </Button>
                  )}
                  {nextHref && (
                    <Button variant="outline" size="sm" render={<Link href={nextHref} />}>
                      Older records
                    </Button>
                  )}
                </nav>
              )}
            </div>
          </>
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
      {columnDialog && (
        <TableDialog
          table={table}
          {...(columnDialog.withNewColumn ? { withNewColumn: true } : {})}
          {...(columnDialog.focusColumn ? { focusColumn: columnDialog.focusColumn } : {})}
          onClose={() => setColumnDialog(null)}
          onSaved={() => {
            setColumnDialog(null);
            router.refresh();
          }}
        />
      )}
      {deletingColumn && (
        <DeleteColumnDialog
          table={table}
          column={deletingColumn}
          onClose={() => setDeletingColumn(null)}
        />
      )}
      {deletingRecords && (
        <DeleteRecordsDialog
          table={table}
          recordIds={[...selected]}
          onClose={() => setDeletingRecords(false)}
          onDeleted={(deleted) =>
            setSelected((current) => new Set([...current].filter((id) => !deleted.includes(id))))
          }
        />
      )}
      {deletingTable && <DeleteTableDialog table={table} onClose={() => setDeletingTable(false)} />}
    </PageFrame>
  );
}
