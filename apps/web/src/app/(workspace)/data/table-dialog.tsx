"use client";

import type { DataColumn, DataTable, DataTableInput } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@automator/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@automator/ui/field";
import { Input } from "@automator/ui/input";
import { Textarea } from "@automator/ui/textarea";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAccessToken } from "../../../auth/access-token";
import {
  createDataTableRequest,
  DataRequestError,
  updateDataTableRequest,
} from "../../../data/client";
import { columnIdFrom } from "../../../data/record-schema";
import { ColumnEditor, newColumnRow, toColumnRows, type ColumnRow } from "./column-editor";

const descriptionLimit = 280;

const failureMessages: Record<string, string> = {
  unauthorized: "Your session expired. Reload the page and try again.",
  not_found: "This table no longer exists.",
  rate_limited: "That was a lot of changes at once. Wait a minute and try again.",
  invalid_table:
    "This table could not be saved. Check the column names and types — a column's type cannot change once the table has records.",
};

/** The problems the dialog can see on its own, so the API is only asked about a sound table. */
function problemsIn(name: string, columns: readonly DataColumn[]): string[] {
  const problems: string[] = [];
  if (name.trim() === "") problems.push("Give the table a name.");
  if (columns.length === 0) problems.push("Add at least one column.");
  if (columns.some((column) => column.name.trim() === ""))
    problems.push("Give every column a name.");
  const names = columns.map((column) => column.name.trim().toLowerCase()).filter((n) => n !== "");
  if (new Set(names).size !== names.length) problems.push("Give every column a different name.");
  if (columns.some((column) => column.type === "select" && (column.options ?? []).length === 0))
    problems.push("Give every single select column at least one option.");
  return problems;
}

/**
 * The table as the API takes it. A column added in this dialog carries no id until here, so its id
 * is minted from the name the user finished typing, unique against every id already in the list.
 * A column that already exists keeps its id, whatever it was renamed to, so its values still resolve.
 */
function toInput(
  name: string,
  description: string,
  columns: readonly DataColumn[],
): DataTableInput {
  const ids = columns.map((column) => column.id).filter((id) => id !== "");
  return {
    name: name.trim(),
    ...(description.trim() === "" ? {} : { description: description.trim() }),
    columns: columns.map((column) => {
      if (column.id !== "") return toColumn(column, column.id);
      const id = columnIdFrom(column.name, ids);
      ids.push(id);
      return toColumn(column, id);
    }),
  };
}

function toColumn(column: DataColumn, id: string): DataColumn {
  return {
    id,
    name: column.name.trim(),
    type: column.type,
    required: column.required,
    ...(column.type === "select" ? { options: column.options ?? [] } : {}),
  };
}

const columnsFieldId = "data-table-columns";

/**
 * Creates a table, or edits the name, description and columns of `table`. The dialog stays open
 * while a request is in flight so a stray Escape cannot lose what was typed.
 *
 * `withNewColumn` and `focusColumn` are how the grid opens this: its trailing “+” asks for a
 * blank column, and a heading's Rename asks for that column, so either arrives with the right
 * field already focused instead of leaving the reader to find it in the list.
 */
export function TableDialog({
  table,
  withNewColumn = false,
  focusColumn,
  onClose,
  onSaved,
}: {
  table?: DataTable;
  withNewColumn?: boolean;
  focusColumn?: string;
  onClose(): void;
  onSaved(saved: DataTable): void;
}) {
  const getAccessToken = useAccessToken();
  const [name, setName] = useState(table?.name ?? "");
  const [description, setDescription] = useState(table?.description ?? "");
  const [columns, setColumns] = useState<ColumnRow[]>(() => {
    if (!table) return [newColumnRow()];
    const rows = toColumnRows(table.columns);
    return withNewColumn ? [...rows, newColumnRow()] : rows;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  /* The list as it was when the dialog opened: what the focused field is counted against. */
  const columnsAtOpen = useRef(columns);
  // Only the columns that existed when the table already had records are type-locked.
  const [locked] = useState(
    () => new Set(table && table.recordCount > 0 ? table.columns.map((column) => column.id) : []),
  );

  /*
   * The field the dialog was opened on. The popup takes focus itself when it opens, so this has
   * to wait for the frame after that; missing it costs a focus, not the edit.
   */
  useEffect(() => {
    const index = withNewColumn
      ? columnsAtOpen.current.length - 1
      : focusColumn
        ? columnsAtOpen.current.findIndex((column) => column.id === focusColumn)
        : -1;
    if (index < 0) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`${columnsFieldId}-${index}-name`)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [withNewColumn, focusColumn]);

  const descriptionTooLong = description.length > descriptionLimit;
  const problems = problemsIn(name, columns);
  const blocked = problems.length > 0 || descriptionTooLong;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || blocked) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const input = toInput(name, description, columns);
      const token = await getAccessToken();
      const saved = table
        ? await updateDataTableRequest(table.id, token, input)
        : await createDataTableRequest(token, input);
      onSaved(saved);
    } catch (cause) {
      const code = cause instanceof DataRequestError ? cause.code : "unavailable";
      setError(failureMessages[code] ?? "The table could not be saved. Please try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next, details) => {
        if (pending.current) details.cancel();
        else if (!next) onClose();
      }}
    >
      <DialogPopup className="max-w-lg" aria-busy={busy} closeProps={{ disabled: busy }}>
        <DialogHeader>
          <DialogTitle>
            {table ? (withNewColumn ? "Add a column" : "Edit columns") : "New table"}
          </DialogTitle>
          <DialogDescription>
            {table
              ? withNewColumn
                ? "A new column is waiting at the end of the list. Name it and pick what it holds."
                : "Rename the table or change its columns. Removing a column hides its values; adding it back shows them again."
              : "A table stores records your flows can read and write. Give it a name and the columns a record has."}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form id="data-table-form" onSubmit={save} className="flex flex-col gap-5">
            <Field>
              <FieldLabel htmlFor="data-table-name">Name</FieldLabel>
              <Input
                id="data-table-name"
                name="name"
                required
                maxLength={64}
                placeholder="Signups"
                value={name}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field invalid={descriptionTooLong}>
              <FieldLabel htmlFor="data-table-description">Description</FieldLabel>
              <Textarea
                id="data-table-description"
                name="description"
                rows={2}
                maxLength={descriptionLimit}
                placeholder="What this table holds. Optional."
                value={description}
                disabled={busy}
                aria-invalid={descriptionTooLong || undefined}
                aria-describedby="data-table-description-help"
                onChange={(event) => setDescription(event.target.value)}
              />
              <FieldDescription id="data-table-description-help" className="tabular-nums">
                {description.length}/{descriptionLimit}
              </FieldDescription>
            </Field>
            <ColumnEditor
              id={columnsFieldId}
              columns={columns}
              locked={locked}
              disabled={busy}
              onChange={setColumns}
            />
            {problems.length > 0 && (
              <ul className="flex flex-col gap-1 text-caption text-muted-foreground">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            )}
            {error && (
              <p role="alert" className="text-caption text-destructive-text">
                {error}
              </p>
            )}
          </form>
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="data-table-form" loading={busy} disabled={blocked}>
            {table ? "Save columns" : "Create table"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
