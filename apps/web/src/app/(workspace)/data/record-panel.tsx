"use client";

import { validateRecordValues, type DataRecord, type DataTable } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@automator/ui/dialog";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@automator/ui/menu";
import { RiMoreLine } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { useAccessToken } from "../../../auth/access-token";
import { SidePanel } from "../../../components/side-panel";
import { ConfigField } from "../../../components/schema-form";
import {
  createDataRecordRequest,
  DataRequestError,
  deleteDataRecordRequest,
  updateDataRecordRequest,
} from "../../../data/client";
import {
  columnsToSchema,
  formValuesToRecord,
  recordToFormValues,
  type RecordFormValues,
} from "../../../data/record-schema";
import { LocalTime } from "../runs/local-time";
import { recordLabel } from "./[tableId]/record-value";

const failureMessages: Record<string, string> = {
  unauthorized: "Your session expired. Reload the page and try again.",
  not_found: "This record no longer exists.",
  rate_limited: "That was a lot of changes at once. Wait a minute and try again.",
  invalid_record: "Some values do not match their columns. Check them and try again.",
  conflict: "This record changed elsewhere. Reload the page, then edit it again.",
};

/**
 * One record beside the grid it belongs to: every column as a labelled field, which is what makes
 * a wide table readable. Saving carries the `updatedAt` the reader last saw, so a record someone
 * else changed meanwhile is refused rather than overwritten — the rule the cells already follow.
 *
 * Without a `record` this is the create state at `/data/<table>/new`.
 */
export function RecordPanel({
  table,
  record,
  closeHref,
}: {
  table: DataTable;
  record?: DataRecord;
  closeHref: string;
}) {
  const getAccessToken = useAccessToken();
  const router = useRouter();
  const schema = columnsToSchema(table.columns);
  const [values, setValues] = useState<RecordFormValues>(() =>
    recordToFormValues(table.columns, record?.values),
  );
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
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
      if (record) {
        await updateDataRecordRequest(table.id, record.id, token, {
          values: body,
          expectedUpdatedAt: record.updatedAt,
        });
        /* Saving an edit leaves the record open: the panel is where it is being read, and the
         * grid behind it is what needs to catch up. */
        router.refresh();
      } else {
        await createDataRecordRequest(table.id, token, { values: body });
        router.push(closeHref, { scroll: false });
        router.refresh();
      }
    } catch (cause) {
      const code = cause instanceof DataRequestError ? cause.code : "unavailable";
      setError(failureMessages[code] ?? "The record could not be saved. Please try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function remove() {
    if (!record) return;
    setBusy(true);
    setError(null);
    try {
      await deleteDataRecordRequest(table.id, record.id, await getAccessToken());
      setDeleting(false);
      router.push(closeHref, { scroll: false });
      router.refresh();
    } catch (cause) {
      const code = cause instanceof DataRequestError ? cause.code : "unavailable";
      if (code === "not_found") {
        setDeleting(false);
        router.push(closeHref, { scroll: false });
        router.refresh();
        return;
      }
      setError(failureMessages[code] ?? "The record could not be deleted. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const title = record ? recordLabel(table, record) : "New record";

  return (
    <SidePanel
      title={title}
      subtitle={
        record ? (
          <>
            Edited <LocalTime value={record.updatedAt} />
          </>
        ) : (
          `A new record in ${table.name}`
        )
      }
      closeHref={closeHref}
      label={record ? `Record: ${title}` : "New record"}
    >
      <form id="record-panel-form" onSubmit={save} className="flex flex-col gap-5" aria-busy={busy}>
        {table.columns.length === 0 && (
          <p className="text-caption text-muted-foreground">
            This table has no columns yet. Add one before adding records.
          </p>
        )}
        {table.columns.map((column) => {
          const fieldId = `panel-${column.id}`;
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
                <p id={`${fieldId}-error`} role="alert" className="text-xs text-destructive-text">
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
        <div className="flex items-center gap-2 pt-1">
          <Button type="submit" size="sm" loading={busy} disabled={table.columns.length === 0}>
            {record ? "Save record" : "Add record"}
          </Button>
          {record && (
            <Menu>
              <MenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Record actions"
                    type="button"
                  />
                }
              >
                <RiMoreLine aria-hidden="true" />
              </MenuTrigger>
              <MenuPopup align="start">
                <MenuItem onClick={() => setDeleting(true)}>Delete record</MenuItem>
              </MenuPopup>
            </Menu>
          )}
        </div>
      </form>

      <Dialog open={deleting} onOpenChange={(next) => !busy && !next && setDeleting(false)}>
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this record?</DialogTitle>
            <DialogDescription>
              {`“${title}” is removed from ${table.name}. This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button variant="destructive" loading={busy} onClick={remove}>
              Delete record
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </SidePanel>
  );
}
