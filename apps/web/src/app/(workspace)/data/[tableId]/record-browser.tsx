"use client";

import type { DataColumn, DataRecord, DataTable } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@automator/ui/dialog";
import { EmptyStateIllustration } from "@automator/ui/empty-state-illustration";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@automator/ui/tooltip";
import {
  RiAddLine,
  RiDeleteBinLine,
  RiEditLine,
  RiErrorWarningLine,
  RiTableLine,
} from "@remixicon/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAccessToken } from "../../../../auth/access-token";
import { WorkspaceBreadcrumbs } from "../../../../components/workspace-breadcrumbs";
import { DataRequestError, deleteDataRecordRequest } from "../../../../data/client";
import styles from "../../flows/flows.module.css";
import { LocalTime } from "../../runs/local-time";
import { TableDialog } from "../table-dialog";
import { DeleteTableDialog } from "./delete-table-dialog";
import { RecordCell } from "./record-cell";
import { RecordDialog } from "./record-dialog";

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function blank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

/** One value as the table shows it: readable, and never wider than the column it sits in. */
export function RecordValue({ column, value }: { column: DataColumn; value: unknown }): ReactNode {
  if (column.type === "checkbox") return value === true ? "Yes" : "No";
  if (blank(value)) return <span className="text-muted-foreground">—</span>;
  if (column.type === "datetime" && typeof value === "string")
    return Number.isNaN(Date.parse(value)) ? value : <LocalTime value={value} zone={false} />;
  if (column.type === "address" && typeof value === "string")
    return (
      <code className="text-code" title={value}>
        {shortAddress(value)}
      </code>
    );
  if (column.type === "number") return <span className="tabular-nums">{String(value)}</span>;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (
    <span className="block max-w-[40ch] truncate" title={text}>
      {text}
    </span>
  );
}

function recordLabel(table: DataTable, record: DataRecord): string {
  for (const column of table.columns) {
    const value = record.values[column.id];
    if (typeof value === "string" && value.trim() !== "") return value;
    if (typeof value === "number") return String(value);
  }
  return record.id;
}

function RecordActions({
  label,
  onEdit,
  onDelete,
}: {
  label: string;
  onEdit(): void;
  onDelete(): void;
}) {
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit record: ${label}`}
              onClick={onEdit}
            />
          }
        >
          <RiEditLine aria-hidden="true" />
        </TooltipTrigger>
        <TooltipPopup>Edit</TooltipPopup>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete record: ${label}`}
              onClick={onDelete}
            />
          }
        >
          <RiDeleteBinLine aria-hidden="true" />
        </TooltipTrigger>
        <TooltipPopup>Delete</TooltipPopup>
      </Tooltip>
    </>
  );
}

type Editing = { record?: DataRecord } | null;

/**
 * The table's records with the actions that change them. `records` is `null` when the record list
 * itself could not load, which leaves the page and its table actions usable.
 */
export function RecordBrowser({
  table,
  records,
  nextHref,
  latestHref,
  retryHref,
  retryCursor,
}: {
  table: DataTable;
  records: readonly DataRecord[] | null;
  nextHref?: string;
  latestHref?: string;
  /** The page's own path, without a query: a GET form drops the query of its action. */
  retryHref: string;
  retryCursor?: string;
}) {
  const getAccessToken = useAccessToken();
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
  const [editingColumns, setEditingColumns] = useState(false);
  const [deletingTable, setDeletingTable] = useState(false);
  const [deletingRecord, setDeletingRecord] = useState<DataRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Cell edits answer with the stored record, so the row shows it without refetching the page. */
  const [edited, setEdited] = useState<Record<string, DataRecord>>({});
  const saveCell = (record: DataRecord) =>
    setEdited((current) => ({ ...current, [record.id]: record }));

  async function deleteRecord(record: DataRecord) {
    setBusy(true);
    setError(null);
    try {
      await deleteDataRecordRequest(table.id, record.id, await getAccessToken());
      setDeletingRecord(null);
      router.refresh();
    } catch (cause) {
      const code = cause instanceof DataRequestError ? cause.code : "unavailable";
      if (code === "not_found") {
        setDeletingRecord(null);
        router.refresh();
        return;
      }
      setError(
        code === "unauthorized"
          ? "Your session expired. Reload the page and try again."
          : "The record could not be deleted. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className={styles.header}>
        <WorkspaceBreadcrumbs parents={[{ label: "Data", href: "/data" }]} current={table.name} />
        <div className={styles.headerActions}>
          <Button
            variant="ghost"
            className="text-destructive-text"
            onClick={() => setDeletingTable(true)}
          >
            Delete table
          </Button>
          <Button variant="outline" onClick={() => setEditingColumns(true)}>
            Edit columns
          </Button>
          <Button onClick={() => setEditing({})}>
            <RiAddLine aria-hidden="true" />
            Add record
          </Button>
        </div>
      </header>
      {table.description && (
        <p className="mt-2 max-w-2xl text-caption text-pretty text-muted-foreground">
          {table.description}
        </p>
      )}
      <section aria-label="Records" className={styles.collection}>
        {records === null ? (
          <div className={styles.empty}>
            <EmptyStateIllustration icon={<RiErrorWarningLine />} />
            <p className="mt-6 text-panel text-balance" role="status">
              Records could not load
            </p>
            <p className="mt-3 max-w-sm text-body text-pretty text-muted-foreground">
              The record list is temporarily unavailable. Try again to read this table.
            </p>
            <form action={retryHref} method="get" className="mt-6">
              {retryCursor && <input type="hidden" name="cursor" value={retryCursor} />}
              <Button variant="outline" type="submit">
                Try again
              </Button>
            </form>
          </div>
        ) : records.length === 0 ? (
          <div className={styles.empty}>
            <EmptyStateIllustration icon={<RiTableLine />} />
            <h2 className="mt-6 text-panel text-balance">
              {latestHref ? "No more records" : "No records yet"}
            </h2>
            <p className="mt-3 max-w-sm text-body text-pretty text-muted-foreground">
              {latestHref
                ? "There is nothing on this page. Return to the first page to see this table's records."
                : "Add a record here, or let a flow write one with a Create record node."}
            </p>
            {latestHref ? (
              <Button variant="outline" className="mt-6" render={<Link href={latestHref} />}>
                Back to the first page
              </Button>
            ) : (
              <Button className="mt-6" onClick={() => setEditing({})}>
                <RiAddLine aria-hidden="true" />
                Add record
              </Button>
            )}
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="sr-only">Records in {table.name}, newest first</caption>
              <thead>
                <tr>
                  {table.columns.map((column) => (
                    <th key={column.id} scope="col">
                      {column.name}
                    </th>
                  ))}
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {records.map((stored) => {
                  const record = edited[stored.id] ?? stored;
                  return (
                    <tr key={record.id}>
                      {table.columns.map((column, index) =>
                        index === 0 ? (
                          <th key={column.id} scope="row" className="font-normal">
                            <RecordCell
                              table={table}
                              record={record}
                              column={column}
                              onSaved={saveCell}
                            />
                          </th>
                        ) : (
                          <td key={column.id}>
                            <RecordCell
                              table={table}
                              record={record}
                              column={column}
                              onSaved={saveCell}
                            />
                          </td>
                        ),
                      )}
                      <td className="w-px text-end whitespace-nowrap">
                        <RecordActions
                          label={recordLabel(table, record)}
                          onEdit={() => setEditing({ record })}
                          onDelete={() => {
                            setError(null);
                            setDeletingRecord(record);
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
      {editing && (
        <RecordDialog
          table={table}
          record={editing.record}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
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
      <Dialog
        open={deletingRecord !== null}
        onOpenChange={(next) => !busy && !next && setDeletingRecord(null)}
      >
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this record?</DialogTitle>
            <DialogDescription>
              {deletingRecord
                ? `“${recordLabel(table, deletingRecord)}” is removed from ${table.name}. This cannot be undone.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="px-6 text-caption text-destructive-text">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setDeletingRecord(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={busy}
              onClick={() => deletingRecord && deleteRecord(deletingRecord)}
            >
              Delete record
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
