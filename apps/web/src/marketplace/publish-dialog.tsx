"use client";

import type { MarketplaceListing } from "@automator/contracts";
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
import { RiExternalLinkLine } from "@remixicon/react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  getFlowListingRequest,
  MarketplaceRequestError,
  publishListingRequest,
  unpublishListingRequest,
} from "./client";
import { CopyLinkButton } from "./copy-link-button";
import { useAccessToken } from "../auth/access-token";
import { useLeaveGuard } from "../builder/leave-guard";

const descriptionLimit = 280;

const failureMessages: Record<string, string> = {
  unauthorized: "Your session expired. Reload the page and try again.",
  forbidden: "Finish setting up your profile before publishing a flow.",
  not_found: "This flow no longer exists, so it cannot be published.",
  invalid_listing: "Enter a name and keep the description under 280 characters.",
};

type Phase = "loading" | "editing" | "published" | "confirm-unpublish";

/**
 * Publishes the flow's last saved version as a marketplace listing, or updates and removes an
 * existing one. The listing is a snapshot: later edits stay private until published again.
 * Mount it to open it: each mount starts from the server's view of the flow's listing.
 */
export function PublishDialog({
  onClose,
  flowId,
  flowName,
  flowDescription,
  unsaved,
}: {
  onClose: () => void;
  flowId: string;
  flowName: string;
  flowDescription: string;
  /** True while the canvas has changes the server has not seen. */
  unsaved: boolean;
}) {
  const getAccessToken = useAccessToken();
  // Leaving for the listing page is a navigation away from the canvas, so it is guarded too.
  const guardLink = useLeaveGuard();
  const [phase, setPhase] = useState<Phase>("loading");
  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [name, setName] = useState(flowName);
  const [description, setDescription] = useState(flowDescription);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const current = await getFlowListingRequest(await getAccessToken(), flowId);
        if (cancelled) return;
        if (current) {
          setListing(current);
          setName(current.name);
          setDescription(current.description);
        }
      } catch (cause) {
        if (cancelled) return;
        setError(describe(cause, "The listing could not be loaded. You can still publish."));
      }
      setPhase("editing");
    })();
    return () => {
      cancelled = true;
    };
  }, [flowId, getAccessToken]);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const published = await publishListingRequest(await getAccessToken(), {
        flowId,
        name: name.trim(),
        description: description.trim(),
      });
      setListing(published);
      setPhase("published");
    } catch (cause) {
      setError(describe(cause, "The flow could not be published. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function unpublish() {
    if (busy || !listing) return;
    setBusy(true);
    setError(null);
    try {
      await unpublishListingRequest(await getAccessToken(), listing.slug);
      onClose();
    } catch (cause) {
      setPhase("editing");
      setError(describe(cause, "The listing could not be removed. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  const updating = listing !== null && phase !== "published";
  const listingPath = listing ? `/marketplace/${listing.slug}` : null;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogPopup className="max-w-md" aria-busy={phase === "loading"}>
        {phase === "published" && listing ? (
          <>
            <DialogHeader>
              <DialogTitle>Published to the marketplace</DialogTitle>
              <DialogDescription>
                Anyone signed in can find and fork “{listing.name}”. Edits you make from now on stay
                private until you publish again.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              {listingPath && <CopyLinkButton path={listingPath} />}
              <Button
                render={
                  <Link
                    href={listingPath ?? "/marketplace"}
                    onClick={guardLink(listingPath ?? "/marketplace")}
                  />
                }
              >
                View listing
                <RiExternalLinkLine aria-hidden="true" />
              </Button>
            </DialogFooter>
          </>
        ) : phase === "confirm-unpublish" && listing ? (
          <>
            <DialogHeader>
              <DialogTitle>Remove “{listing.name}” from the marketplace?</DialogTitle>
              <DialogDescription>
                The listing disappears for everyone. Flows already forked from it are kept by their
                owners.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" disabled={busy} onClick={() => setPhase("editing")}>
                Keep listing
              </Button>
              <Button variant="destructive" loading={busy} onClick={unpublish}>
                Unpublish
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {updating ? "Update listing" : "Publish to the marketplace"}
              </DialogTitle>
              <DialogDescription>
                {updating
                  ? "Replaces the listing with the last saved version of this flow. Its link stays the same."
                  : "Shares the last saved version of this flow. Anyone signed in can find it and fork a copy."}
              </DialogDescription>
            </DialogHeader>
            <DialogPanel>
              <form id="publish-listing" onSubmit={publish} className="flex flex-col gap-5">
                {unsaved && (
                  <p role="status" className="text-caption text-warning-foreground">
                    Unsaved changes are not included. Save the flow first to publish them.
                  </p>
                )}
                <Field>
                  <FieldLabel htmlFor="listing-name">Listing name</FieldLabel>
                  <Input
                    id="listing-name"
                    name="name"
                    required
                    maxLength={120}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={phase === "loading" || busy}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="listing-description">Description</FieldLabel>
                  <Textarea
                    id="listing-description"
                    name="description"
                    maxLength={descriptionLimit}
                    rows={3}
                    placeholder="What the flow does and who it is for."
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    disabled={phase === "loading" || busy}
                  />
                  <FieldDescription className="tabular-nums">
                    {description.length}/{descriptionLimit}
                  </FieldDescription>
                </Field>
                {error && (
                  <p role="alert" className="text-caption text-destructive-text">
                    {error}
                  </p>
                )}
              </form>
            </DialogPanel>
            <DialogFooter>
              {updating && (
                <Button
                  variant="ghost"
                  className="text-destructive-text sm:mr-auto"
                  disabled={busy}
                  onClick={() => setPhase("confirm-unpublish")}
                >
                  Unpublish
                </Button>
              )}
              <Button variant="outline" disabled={busy} onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="publish-listing"
                loading={busy}
                disabled={phase === "loading" || !name.trim()}
              >
                {updating ? "Update listing" : "Publish"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogPopup>
    </Dialog>
  );
}

function describe(cause: unknown, fallback: string) {
  const code = cause instanceof MarketplaceRequestError ? cause.code : "unavailable";
  return failureMessages[code] ?? fallback;
}
