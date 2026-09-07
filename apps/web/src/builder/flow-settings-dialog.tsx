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
import { Textarea } from "@automator/ui/textarea";
import { RiSettings3Line } from "@remixicon/react";
import { useMemo, useState } from "react";
import { CopyButton } from "./copy-button";
import { serializeFlow } from "./document";
import styles from "./flow-builder.module.css";
import { useBuilderStore } from "./store-provider";

function FlowSettingsForm() {
  const meta = useBuilderStore((state) => state.meta);
  const nodes = useBuilderStore((state) => state.nodes);
  const edges = useBuilderStore((state) => state.edges);
  const setMeta = useBuilderStore((state) => state.setMeta);
  const [nameDraft, setNameDraft] = useState(meta.name);
  const [lastSyncedName, setLastSyncedName] = useState(meta.name);
  // Keep the field in sync with renames made elsewhere, such as an agent edit.
  if (meta.name !== lastSyncedName) {
    setLastSyncedName(meta.name);
    setNameDraft(meta.name);
  }
  const json = useMemo(
    () => JSON.stringify(serializeFlow(meta, nodes, edges), null, 2),
    [edges, meta, nodes],
  );

  return (
    <div className="flex flex-col gap-5">
      <Field>
        <FieldLabel>Name</FieldLabel>
        <Input
          value={nameDraft}
          onChange={(event) => {
            const next = event.target.value;
            setNameDraft(next);
            if (next.trim()) setMeta({ name: next });
          }}
          onBlur={() => setNameDraft(meta.name)}
        />
      </Field>
      <Field>
        <FieldLabel>Description</FieldLabel>
        <Textarea
          rows={3}
          value={meta.description}
          onChange={(event) => setMeta({ description: event.target.value })}
        />
      </Field>
      <section aria-labelledby="flow-json-heading" className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h3 id="flow-json-heading" className="text-label">
            Flow JSON
          </h3>
          <CopyButton text={json} label="Copy flow JSON" />
        </div>
        <div className={styles.json}>
          <pre className="m-0 p-3 font-mono text-xs leading-[18px] whitespace-pre">{json}</pre>
        </div>
      </section>
    </div>
  );
}

/**
 * Flow-level settings behind the left panel's gear: name, description and the live document.
 * The name never commits an empty value; blurring restores the stored name.
 */
export function FlowSettingsDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Flow settings" />}>
        <RiSettings3Line aria-hidden="true" />
      </DialogTrigger>
      <DialogPopup className="max-h-[min(640px,calc(100dvh-32px))]">
        <DialogHeader>
          <DialogTitle>Flow settings</DialogTitle>
          <DialogDescription>
            Name this flow, describe what it does, and read its document.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <FlowSettingsForm />
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Done</DialogClose>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
