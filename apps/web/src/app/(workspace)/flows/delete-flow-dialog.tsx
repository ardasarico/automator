"use client";

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
import { useState } from "react";
import { deleteFlowRequest, FlowRequestError } from "../../../flows/client";
import { useAccessToken } from "../../../auth/access-token";

const failureMessages: Record<string, string> = {
  unauthorized: "Your session expired. Reload the page and try again.",
  not_found: "This flow was already deleted.",
};

/**
 * Controlled by its caller, so the trigger can live inside a menu: the menu closes on the click
 * that opens this, and a dialog owned by the closing popup would unmount with it.
 */
export function DeleteFlowDialog({
  id,
  name,
  open,
  onOpenChange,
}: {
  id: string;
  name: string;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const getAccessToken = useAccessToken();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await deleteFlowRequest(id, await getAccessToken());
      onOpenChange(false);
      router.refresh();
    } catch (caught) {
      const code = caught instanceof FlowRequestError ? caught.code : "unavailable";
      if (code === "not_found") {
        onOpenChange(false);
        router.refresh();
        return;
      }
      setError(failureMessages[code] ?? "The flow could not be deleted. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete “{name}”?</DialogTitle>
          <DialogDescription>
            The flow, its marketplace listing and its run history are removed. This cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="px-6 text-caption text-destructive-text">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" loading={busy} onClick={confirm}>
            Delete flow
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
