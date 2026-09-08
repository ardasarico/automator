"use client";

import type { DataColumn, DataRecord, DataTable } from "@automator/contracts";
import { Checkbox } from "@automator/ui/checkbox";
import { Input } from "@automator/ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@automator/ui/select";
import { Spinner } from "@automator/ui/spinner";
import { useRef, useState } from "react";
import { RecordValue } from "./record-browser";
import { useAccessToken } from "../../../../auth/access-token";
import { fromLocalInput, toLocalInput } from "../../../../components/schema-form";
import { DataRequestError, updateDataRecordRequest } from "../../../../data/client";

const failureMessages: Record<string, string> = {
  conflict: "This record changed elsewhere. Reload the page, then edit it again.",
  invalid_record: "That value does not fit this column.",
  unauthorized: "Your session expired. Reload the page and try again.",
  not_found: "This record no longer exists.",
};

/** The draft a cell edits: always text, except the checkbox, which saves without an edit mode. */
function toDraft(column: DataColumn, value: unknown): string {
  if (column.type === "datetime") return toLocalInput(typeof value === "string" ? value : "");
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

/** The draft as the API's patch value; `null` clears the column. */
export function draftToValue(column: DataColumn, draft: string): unknown {
  const text = draft.trim();
  if (text === "") return null;
  if (column.type === "number") {
    const parsed = Number(text);
    // Text that is not a number travels as text so the API names the column in its refusal.
    return Number.isFinite(parsed) ? parsed : text;
  }
  if (column.type === "datetime") return fromLocalInput(draft) || draft;
  return text;
}

function sameValue(a: unknown, b: unknown): boolean {
  return (a ?? null) === (b ?? null);
}

/** The editor replaces the cell's button, so it takes the focus that button had. */
function focusOnMount(element: HTMLInputElement | null) {
  element?.focus();
}

/**
 * One value of one record, editable in place. Enter saves, Escape cancels, and a refused save
 * keeps the draft in the editor so nothing typed is lost.
 */
export function RecordCell({
  table,
  record,
  column,
  onSaved,
}: {
  table: DataTable;
  record: DataRecord;
  column: DataColumn;
  onSaved(record: DataRecord): void;
}) {
  const getAccessToken = useAccessToken();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const stored = record.values[column.id];
  const cellLabel = `${column.name} of this record`;

  async function save(value: unknown) {
    if (pending.current) return;
    if (sameValue(value, stored)) {
      setEditing(false);
      setError(null);
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const saved = await updateDataRecordRequest(table.id, record.id, await getAccessToken(), {
        values: { [column.id]: value },
        merge: true,
        expectedUpdatedAt: record.updatedAt,
      });
      onSaved(saved);
      setEditing(false);
    } catch (cause) {
      const code = cause instanceof DataRequestError ? cause.code : "unavailable";
      setError(failureMessages[code] ?? "The change could not be saved. Please try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const message = error && (
    <span role="alert" className="mt-1 block text-caption text-destructive-text">
      {error}
    </span>
  );

  if (column.type === "checkbox") {
    return (
      <span className="flex items-center gap-2">
        <Checkbox
          aria-label={cellLabel}
          checked={stored === true}
          disabled={busy}
          onCheckedChange={(checked) => void save(checked)}
        />
        {busy && <Spinner className="size-3" />}
        {message}
      </span>
    );
  }

  if (!editing) {
    return (
      <span className="flex items-center gap-2">
        <button
          type="button"
          className="min-w-0 cursor-text rounded-sm px-1 py-0.5 text-start hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          aria-label={`Edit ${cellLabel}`}
          onClick={() => {
            setDraft(toDraft(column, stored));
            setError(null);
            setEditing(true);
          }}
        >
          <RecordValue column={column} value={stored} />
        </button>
        {message}
      </span>
    );
  }

  const commit = () => void save(draftToValue(column, draft));
  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  if (column.type === "select") {
    const options = column.options ?? [];
    return (
      <span className="flex flex-col">
        <Select
          items={options.map((option) => ({ value: option, label: option }))}
          value={typeof stored === "string" ? stored : ""}
          onValueChange={(next) => void save(next)}
        >
          <SelectTrigger size="sm" aria-label={cellLabel} disabled={busy}>
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        {message}
      </span>
    );
  }

  return (
    <span className="flex flex-col">
      <Input
        ref={focusOnMount}
        size="sm"
        aria-label={cellLabel}
        aria-busy={busy}
        aria-invalid={error !== null || undefined}
        disabled={busy}
        type={
          column.type === "number"
            ? "number"
            : column.type === "datetime"
              ? "datetime-local"
              : "text"
        }
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
        }}
        onBlur={() => {
          // A refused save keeps its editor open, so blur must not discard the draft.
          if (!busy && !error) commit();
        }}
      />
      {message}
    </span>
  );
}
