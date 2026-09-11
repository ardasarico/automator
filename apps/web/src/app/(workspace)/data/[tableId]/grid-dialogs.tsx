"use client";

import type { DataColumn, DataTable, DataTableInput } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@automator/ui/dialog";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { useAccessToken } from "../../../../auth/access-token";
import {
  DataRequestError,
  deleteDataRecordRequest,
  updateDataTableRequest,
} from "../../../../data/client";

const failureMessages: Record<string, string> = {
  unauthorized: "Your session expired. Reload the page and try again.",
  rate_limited: "That was a lot of changes at once. Wait a minute and try again.",
  not_found: "That no longer exists. Reload the page to see what the table holds now.",
  invalid_table: "The table could not be saved as it stands. Open Edit columns to see why.",
};

function describe(cause: unknown, fallback: string): string {
  const code = cause instanceof DataRequestError ? cause.code : "unavailable";
  return failureMessages[code] ?? fallback;
}

/** Asks before something irreversible, and keeps the reason in the dialog when it fails. */
function Confirm({
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm(): Promise<string | null>;
  onClose(): void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);

  async function confirm() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    const failure = await onConfirm();
    pending.current = false;
    setBusy(false);
    if (failure) setError(failure);
    else onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(next, details) => {
        if (pending.current) details.cancel();
        else if (!next) onClose();
      }}
    >
      <DialogPopup className="max-w-md" aria-busy={busy} closeProps={{ disabled: busy }}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="px-6 text-caption text-destructive-text">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button variant="destructive" loading={busy} onClick={confirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

/**
 * Deletes the selected records. There is no bulk endpoint, so this is one request per record: a
 * partial failure says how many went and leaves the rest selected, which is the honest report
 * and the one that lets the reader simply try again.
 */
export function DeleteRecordsDialog({
  table,
  recordIds,
  onClose,
  onDeleted,
}: {
  table: DataTable;
  recordIds: readonly string[];
  onClose(): void;
  onDeleted(deleted: readonly string[]): void;
}) {
  const getAccessToken = useAccessToken();
  const router = useRouter();
  const count = recordIds.length;

  return (
    <Confirm
      title={count === 1 ? "Delete this record?" : `Delete ${count} records?`}
      description={`${
        count === 1 ? "The record is" : "The records are"
      } removed from “${table.name}”. This cannot be undone.`}
      confirmLabel={count === 1 ? "Delete record" : `Delete ${count} records`}
      cancelLabel="Keep them"
      onClose={onClose}
      onConfirm={async () => {
        const token = await getAccessToken();
        const deleted: string[] = [];
        let failure: string | null = null;
        for (const id of recordIds) {
          try {
            await deleteDataRecordRequest(table.id, id, token);
            deleted.push(id);
          } catch (cause) {
            // A record another session already removed counts as done, not as a failure.
            if (cause instanceof DataRequestError && cause.code === "not_found") {
              deleted.push(id);
              continue;
            }
            failure ??= describe(cause, "Those records could not all be deleted.");
          }
        }
        onDeleted(deleted);
        if (deleted.length > 0) router.refresh();
        if (!failure) return null;
        return deleted.length === 0
          ? failure
          : `${deleted.length} of ${count} were deleted. ${failure}`;
      }}
    />
  );
}

/**
 * Removes a column from the table. The values stored under it stay where they are — adding a
 * column back with the same id shows them again — so the dialog says that rather than promising
 * a deletion it does not perform.
 */
export function DeleteColumnDialog({
  table,
  column,
  onClose,
}: {
  table: DataTable;
  column: DataColumn;
  onClose(): void;
}) {
  const getAccessToken = useAccessToken();
  const router = useRouter();

  return (
    <Confirm
      title={`Delete the “${column.name}” column?`}
      description={
        table.recordCount > 0
          ? "The column stops being part of this table and its values stop being shown. Flows that read or write it will report a missing column on their next run."
          : "The column stops being part of this table. Flows that read or write it will report a missing column on their next run."
      }
      confirmLabel="Delete column"
      cancelLabel="Keep column"
      onClose={onClose}
      onConfirm={async () => {
        const input: DataTableInput = {
          name: table.name,
          ...(table.description === undefined ? {} : { description: table.description }),
          columns: table.columns.filter((one) => one.id !== column.id),
        };
        try {
          await updateDataTableRequest(table.id, await getAccessToken(), input);
          router.refresh();
          return null;
        } catch (cause) {
          return describe(cause, "The column could not be deleted. Please try again.");
        }
      }}
    />
  );
}
