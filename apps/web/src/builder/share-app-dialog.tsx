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
import { defaultChainId, isSignerNodeType, type FlowProblem } from "@automator/contracts";
import { RiExternalLinkLine } from "@remixicon/react";
import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { getCatalogEntry } from "./catalog";
import { EnableSigningButton } from "./enable-signing-button";
import { useFlowActivation } from "./flow-activation";
import { selectFlowNodes } from "./store";
import { useBuilderStore } from "./store-provider";
import { needsSigning, useWalletSigning } from "./use-wallet-signing";
import { useAccessToken } from "../auth/access-token";
import { FlowRequestError, setFlowAppPublishedRequest } from "../flows/client";
import { miniAppUrl } from "../lib/runtime-url";
import { CopyLinkButton } from "../marketplace/copy-link-button";

const failureMessages: Record<string, string> = {
  unauthorized: "Your session expired. Reload the page and try again.",
  not_found: "This flow no longer exists, so it cannot be shared.",
  invalid_flow: "The saved flow has problems, so it was not published. Check its problems list.",
};

export function ShareAppDialog({ onClose, unsaved }: { onClose: () => void; unsaved: boolean }) {
  const getAccessToken = useAccessToken();
  const activation = useFlowActivation();
  const flowId = useBuilderStore((state) => state.meta.id);
  const hasEntryScreen = useBuilderStore((state) =>
    selectFlowNodes(state).some((node) => node.data.type === "trigger.miniapp-open"),
  );
  const chainId = useBuilderStore((state) => state.meta.chainId ?? defaultChainId);
  const signerLabels = useBuilderStore(
    useShallow((state) =>
      selectFlowNodes(state)
        .filter((node) => isSignerNodeType(node.data.type))
        .map((node) => node.data.label || getCatalogEntry(node.data.type).label),
    ),
  );
  // Every run of a paying app fails at its first signer node until the owner's wallet lets the
  // server sign, so publishing waits for that; the API refuses it too, this just says so first.
  const signing = useWalletSigning(signerLabels.length > 0 && !activation.appPublished, chainId);
  const signingOff = signerLabels.length > 0 && signing.status === "disabled";
  const [busy, setBusy] = useState(false);
  // Taking the link down is one click that visitors feel at once, so it asks first.
  const [confirming, setConfirming] = useState(false);
  const cancelConfirm = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<readonly FlowProblem[]>([]);
  const pending = useRef(false);
  const url = miniAppUrl(flowId);

  // The Unpublish button that was pressed is gone with the link view, so the question's safe
  // answer takes its focus rather than dropping the reader onto the dialog's body.
  useEffect(() => {
    if (confirming) cancelConfirm.current?.focus();
  }, [confirming]);

  async function change(published: boolean) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    setProblems([]);
    try {
      const record = await setFlowAppPublishedRequest(flowId, await getAccessToken(), published);
      activation.setAppPublished(record.appPublished ?? published);
      setConfirming(false);
    } catch (cause) {
      // A failed unpublish keeps the question open, with what went wrong under it.
      const code = cause instanceof FlowRequestError ? cause.code : "unavailable";
      if (cause instanceof FlowRequestError && cause.problems.length > 0)
        setProblems(cause.problems);
      else setError(failureMessages[code] ?? "The change could not be saved. Please try again.");
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
            {confirming
              ? "Stop sharing this app?"
              : activation.appPublished
                ? "App link"
                : "Share as a mini app"}
          </DialogTitle>
          <DialogDescription>
            {confirming
              ? "The link stops working for visitors. You can publish the app again later."
              : activation.appPublished
                ? "Anyone with this link can open the app and start a run. It is not listed in the marketplace."
                : "Publishes the last saved version as an app anyone with the link can open. It stays out of the marketplace."}
          </DialogDescription>
        </DialogHeader>
        {confirming ? (
          error && (
            <DialogPanel>
              <p role="alert" className="text-caption text-destructive-text">
                {error}
              </p>
            </DialogPanel>
          )
        ) : (
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
            {signingOff && (
              <div role="status" data-signing="off" className="flex flex-col gap-2">
                <p className="text-caption text-warning-foreground">
                  {needsSigning(signerLabels)} server signing, which is off for your wallet. Enable
                  it to publish this app.
                </p>
                <EnableSigningButton onVerified={signing.refresh} />
              </div>
            )}
            {error && (
              <p role="alert" className="text-caption text-destructive-text">
                {error}
              </p>
            )}
            {problems.length > 0 && (
              <div role="alert" className="flex flex-col gap-1">
                <p className="text-caption text-destructive-text">
                  The saved flow has problems, so it was not published. Fix them and try again.
                </p>
                <ul className="text-caption text-muted-foreground list-disc pl-4">
                  {problems.map((problem, index) => (
                    <li key={`${problem.nodeId ?? "flow"}-${index}`}>{problem.message}</li>
                  ))}
                </ul>
              </div>
            )}
          </DialogPanel>
        )}
        <DialogFooter>
          {confirming ? (
            <>
              <Button
                ref={cancelConfirm}
                variant="outline"
                disabled={busy}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
              <Button variant="destructive" loading={busy} onClick={() => void change(false)}>
                Unpublish
              </Button>
            </>
          ) : activation.appPublished ? (
            <>
              <Button
                variant="ghost"
                className="text-destructive-text sm:mr-auto"
                disabled={busy}
                onClick={() => setConfirming(true)}
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
              <Button
                loading={busy}
                disabled={signingOff || (signerLabels.length > 0 && signing.status === "checking")}
                onClick={() => void change(true)}
              >
                Publish app
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
