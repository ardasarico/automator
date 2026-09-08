"use client";

import { validateRecordValues, type DataRecord, type DataTable } from "@automator/contracts";
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
import { useRef, useState, type FormEvent } from "react";
import { useAccessToken } from "../../../../auth/access-token";
import { ConfigField } from "../../../../components/schema-form";
import {
  createDataRecordRequest,
  DataRequestError,
  updateDataRecordRequest,
} from "../../../../data/client";
import {
  columnsToSchema,
  formValuesToRecord,
  recordToFormValues,
  type RecordFormValues,
} from "../../../../data/record-schema";

const failureMessages: Record<string, string> = {
  unauthorized: "Your session expired. Reload the page and try again.",
  not_found: "This record no longer exists.",
  rate_limited: "That was a lot of changes at once. Wait a minute and try again.",
  invalid_record: "Some values do not match their columns. Check them and try again.",
};

/** Creates a record, or edits `record`, with one field per column of the table. */
export function RecordDialog({
  table,
  record,
  onClose,
  onSaved,
}: {
  table: DataTable;
  record?: DataRecord;
  onClose(): void;
  onSaved(): void;
}) {
  const getAccessToken = useAccessToken();
  const schema = columnsToSchema(table.columns);
  const [values, setValues] = useState<RecordFormValues>(() =>
    recordToFormValues(table.columns, record?.values),
  );
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const body = formValuesToRecord(table.columns, values);
    const found = validateRecordValues(table.columns, body);
    if (found.length > 0) {
      setProblems(
        Object.fromEntries(
          found.map((problem) => [problem.path.replace(/^values\./, ""), problem.message]),
        ),
      );
      setError(null);
      return;
    }
    setProblems({});
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (record) await updateDataRecordRequest(table.id, record.id, token, { values: body });
      else await createDataRecordRequest(table.id, token, { values: body });
      onSaved();
    } catch (cause) {
      const code = cause instanceof DataRequestError ? cause.code : "unavailable";
      setError(failureMessages[code] ?? "The record could not be saved. Please try again.");
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
          <DialogTitle>{record ? "Edit record" : "Add record"}</DialogTitle>
          <DialogDescription>
            {record
              ? `One record of “${table.name}”. Empty fields clear the value they hold.`
              : `A new record in “${table.name}”. Fields follow the columns you defined.`}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form id="data-record-form" onSubmit={save} className="flex flex-col gap-5">
            {table.columns.length === 0 && (
              <p className="text-caption text-muted-foreground">
                This table has no columns yet. Add one before adding records.
              </p>
            )}
            {table.columns.map((column) => {
              const fieldId = `record-${column.id}`;
              const problem = problems[column.id];
              return (
                <div key={column.id} className="flex flex-col gap-1">
                  <ConfigField
                    id={fieldId}
                    name={column.name}
                    property={schema[column.id]!}
                    value={values[column.id]}
                    onChange={(next) => setValues((current) => ({ ...current, [column.id]: next }))}
                  />
                  {problem && (
                    <p
                      id={`${fieldId}-error`}
                      role="alert"
                      className="text-xs text-destructive-text"
                    >
                      {problem}
                    </p>
                  )}
                </div>
              );
            })}
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
          <Button
            type="submit"
            form="data-record-form"
            loading={busy}
            disabled={table.columns.length === 0}
          >
            {record ? "Save record" : "Add record"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
