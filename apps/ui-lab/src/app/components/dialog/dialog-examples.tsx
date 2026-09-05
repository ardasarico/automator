"use client";

import { Button } from "@automator/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@automator/ui/dialog";
import { Field, FieldLabel } from "@automator/ui/field";
import { Input } from "@automator/ui/input";
import { useState } from "react";

export function DialogExamples() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Untitled flow");
  const [draft, setDraft] = useState(name);

  return (
    <div className="grid max-w-4xl gap-6">
      <div className="flex flex-wrap gap-3">
        <Dialog
          open={open}
          onOpenChange={(nextOpen) => {
            if (nextOpen) setDraft(name);
            setOpen(nextOpen);
          }}
        >
          <DialogTrigger render={<Button variant="secondary" />}>Edit name</DialogTrigger>
          <DialogPopup>
            <form
              className="flex min-h-0 flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                if (!draft.trim()) return;
                setName(draft.trim());
                setOpen(false);
              }}
            >
              <DialogHeader>
                <DialogTitle>Edit name</DialogTitle>
                <DialogDescription>Changes stay in this preview.</DialogDescription>
              </DialogHeader>
              <DialogPanel>
                <Field>
                  <FieldLabel>Name</FieldLabel>
                  <Input
                    required
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                </Field>
              </DialogPanel>
              <DialogFooter>
                <DialogClose render={<Button variant="secondary" />}>Cancel</DialogClose>
                <Button type="submit" disabled={!draft.trim()}>
                  Save
                </Button>
              </DialogFooter>
            </form>
          </DialogPopup>
        </Dialog>

        <Dialog>
          <DialogTrigger render={<Button variant="secondary" />}>Bare footer</DialogTrigger>
          <DialogPopup>
            <DialogHeader>
              <DialogTitle>Preview dialog</DialogTitle>
              <DialogDescription>
                Press Escape, click outside, or use the close button to dismiss.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter variant="bare">
              <DialogClose render={<Button />}>Got it</DialogClose>
            </DialogFooter>
          </DialogPopup>
        </Dialog>
      </div>
      <p role="status" className="text-caption text-muted-foreground">
        Name: {name}
      </p>
    </div>
  );
}
