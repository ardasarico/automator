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
import { Tooltip, TooltipPopup, TooltipTrigger } from "@automator/ui/tooltip";
import { RiDeleteBinLine } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteFlowRequest, FlowRequestError } from "../../../flows/client";
import { useAccessToken } from "../../../auth/access-token";

const failureMessages: Record<string, string> = {
  unauthorized: "Your session expired. Reload the page and try again.",
  not_found: "This flow was already deleted.",
};

/**
 * Deletes one flow after confirmation; its marketplace listing and run history go with it.
 * The list refreshes from the server afterwards, so a flow that was already gone disappears too.
 */
export function DeleteFlowButton({ id, name }: { id: string; name: string }) {
  const getAccessToken = useAccessToken();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await deleteFlowRequest(id, await getAccessToken());
      setOpen(false);
      router.refresh();
    } catch (caught) {
      const code = caught instanceof FlowRequestError ? caught.code : "unavailable";
      if (code === "not_found") {
        setOpen(false);
        router.refresh();
        return;
      }
      setError(failureMessages[code] ?? "The flow could not be deleted. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete flow: ${name}`}
              onClick={() => setOpen(true)}
            />
          }
        >
          <RiDeleteBinLine aria-hidden="true" />
        </TooltipTrigger>
        <TooltipPopup>Delete</TooltipPopup>
      </Tooltip>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
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
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" loading={busy} onClick={confirm}>
              Delete flow
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
