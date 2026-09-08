"use client";

import type { DataTable, DataTableUsage } from "@automator/contracts";
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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useAccessToken } from "../../../../auth/access-token";
import { DataRequestError, deleteDataTableRequest } from "../../../../data/client";

const failureMessages: Record<string, string> = {
  unauthorized: "Your session expired. Reload the page and try again.",
  rate_limited: "That was a lot of changes at once. Wait a minute and try again.",
};

/**
 * Deletes a table, asking twice when flows still read from it: the first request answers with the
 * flows using it, and only a confirming second request removes it.
 */
export function DeleteTableDialog({ table, onClose }: { table: DataTable; onClose(): void }) {
  const getAccessToken = useAccessToken();
  const router = useRouter();
  const [usedBy, setUsedBy] = useState<readonly DataTableUsage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);

  async function remove(confirm: boolean) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await deleteDataTableRequest(table.id, await getAccessToken(), { confirm });
      if (!result.deleted) {
        setUsedBy(result.usedBy);
        return;
      }
      router.replace("/data");
      router.refresh();
    } catch (cause) {
      const code = cause instanceof DataRequestError ? cause.code : "unavailable";
      if (code === "not_found") {
        router.replace("/data");
        router.refresh();
        return;
      }
      setError(failureMessages[code] ?? "The table could not be deleted. Please try again.");
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
      <DialogPopup className="max-w-md" aria-busy={busy} closeProps={{ disabled: busy }}>
        <DialogHeader>
          <DialogTitle>
            {usedBy ? `“${table.name}” is still in use` : `Delete “${table.name}”?`}
          </DialogTitle>
          <DialogDescription>
            {usedBy
              ? "Deleting it leaves these flows pointing at a table that no longer exists, and their data nodes will report a missing table."
              : `The table and its ${table.recordCount === 1 ? "record" : `${table.recordCount} records`} are removed. This cannot be undone.`}
          </DialogDescription>
        </DialogHeader>
        {usedBy && usedBy.length > 0 && (
          <DialogPanel>
            <p className="text-caption text-muted-foreground">These flows use this table:</p>
            <ul className="mt-2 flex flex-col gap-1">
              {usedBy.map((flow) => (
                <li key={flow.id}>
                  <Link
                    href={`/flows/${flow.id}`}
                    className="text-caption underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                  >
                    {flow.name}
                  </Link>
                </li>
              ))}
            </ul>
          </DialogPanel>
        )}
        {error && (
          <p role="alert" className="px-6 text-caption text-destructive-text">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Keep table
          </Button>
          <Button variant="destructive" loading={busy} onClick={() => remove(usedBy !== null)}>
            {usedBy ? "Delete anyway" : "Delete table"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
