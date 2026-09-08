"use client";

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
import { RiExternalLinkLine } from "@remixicon/react";
import { useRef, useState } from "react";
import { useFlowActivation } from "./flow-activation";
import { useBuilderStore } from "./store-provider";
import { useAccessToken } from "../auth/access-token";
import { FlowRequestError, setFlowAppPublishedRequest } from "../flows/client";
import { miniAppUrl } from "../lib/runtime-url";
import { CopyLinkButton } from "../marketplace/copy-link-button";

const failureMessages: Record<string, string> = {
  unauthorized: "Your session expired. Reload the page and try again.",
  not_found: "This flow no longer exists, so it cannot be shared.",
};

export function ShareAppDialog({ onClose, unsaved }: { onClose: () => void; unsaved: boolean }) {
  const getAccessToken = useAccessToken();
  const activation = useFlowActivation();
  const flowId = useBuilderStore((state) => state.meta.id);
  const hasEntryScreen = useBuilderStore((state) =>
    state.nodes.some((node) => node.data.type === "trigger.miniapp-open"),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const url = miniAppUrl(flowId);

  async function change(published: boolean) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const record = await setFlowAppPublishedRequest(flowId, await getAccessToken(), published);
      activation.setAppPublished(record.appPublished ?? published);
    } catch (cause) {
      const code = cause instanceof FlowRequestError ? cause.code : "unavailable";
      setError(failureMessages[code] ?? "The change could not be saved. Please try again.");
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
          <DialogTitle>{activation.appPublished ? "App link" : "Share as a mini app"}</DialogTitle>
          <DialogDescription>
            {activation.appPublished
              ? "Anyone with this link can open the app and start a run. It is not listed in the marketplace."
              : "Publishes the last saved version as an app anyone with the link can open. It stays out of the marketplace."}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="flex flex-col gap-4">
          {!hasEntryScreen && (
            <p role="status" className="text-caption text-warning-foreground">
              Add a Mini app opened trigger so visitors have somewhere to start.
            </p>
          )}
          {unsaved && (
            <p role="status" className="text-caption text-warning-foreground">
              Unsaved changes are not shared. Save the flow first to include them.
            </p>
          )}
          {activation.appPublished && (
            <Field>
              <FieldLabel htmlFor="app-link">Link</FieldLabel>
              <Input
                id="app-link"
                readOnly
                value={url}
                className="font-mono text-xs"
                onFocus={(event) => event.target.select()}
              />
              <FieldDescription>
                Anyone with the link can open it, so treat it as unlisted rather than private.
              </FieldDescription>
            </Field>
          )}
          {error && (
            <p role="alert" className="text-caption text-destructive-text">
              {error}
            </p>
          )}
        </DialogPanel>
        <DialogFooter>
          {activation.appPublished ? (
            <>
              <Button
                variant="ghost"
                className="text-destructive-text sm:mr-auto"
                loading={busy}
                onClick={() => void change(false)}
              >
                Unpublish
              </Button>
              <CopyLinkButton path={url} />
              <Button
                render={<a href={url} target="_blank" rel="noreferrer" aria-label="Open app" />}
              >
                Open app
                <RiExternalLinkLine aria-hidden="true" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" disabled={busy} onClick={onClose}>
                Cancel
              </Button>
              <Button loading={busy} onClick={() => void change(true)}>
                Publish app
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
