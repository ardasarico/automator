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
import { useRef, useState, type FormEvent } from "react";
import type { BuilderNode } from "./document";
import { PresetRequestError } from "./presets-client";
import { useNodePresets } from "./presets-context";

const failureMessages: Record<string, string> = {
  unauthorized: "Your session expired. Reload the page and try again.",
  conflict: "You have reached the limit of saved nodes. Delete one and try again.",
  invalid_request: "This node cannot be saved. Give it a shorter name and try again.",
};

/** Saves one node's settings as a private preset the palette can insert into any flow. */
export function SavePresetDialog({ node, onClose }: { node: BuilderNode; onClose: () => void }) {
  const { save } = useNodePresets();
  const [name, setName] = useState(node.data.label);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const trimmed = name.trim();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || trimmed === "") return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await save({
        name: trimmed,
        type: node.data.type,
        label: node.data.label,
        config: node.data.config,
      });
      onClose();
    } catch (cause) {
      const code = cause instanceof PresetRequestError ? cause.code : "unavailable";
      setError(failureMessages[code] ?? "The node could not be saved. Please try again.");
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
          <DialogTitle>Save this node</DialogTitle>
          <DialogDescription>
            Keeps these settings under Nodes › Saved, for you only. Inserting one makes an
            independent copy, so later edits to either never reach the other.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form id="save-preset" onSubmit={submit} className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="preset-name">Name</FieldLabel>
              <Input
                id="preset-name"
                size="sm"
                required
                maxLength={64}
                value={name}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
              />
              <FieldDescription>
                Secret fields are not saved: a reference such as {"{{secrets.name}}"} is kept, a
                pasted credential is not.
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
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="save-preset" loading={busy} disabled={trimmed === ""}>
            Save node
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
