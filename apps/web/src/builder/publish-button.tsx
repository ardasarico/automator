"use client";

import { Button } from "@automator/ui/button";
import { RiUpload2Line } from "@remixicon/react";
import { useState } from "react";
import { PublishDialog } from "../marketplace/publish-dialog";
import { useBuilderStore } from "./store-provider";

/** Opens the marketplace publish dialog for the flow on the canvas. */
export function PublishButton() {
  const meta = useBuilderStore((state) => state.meta);
  const dirty = useBuilderStore((state) => state.dirty);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <RiUpload2Line aria-hidden="true" />
        Publish
      </Button>
      {open && (
        <PublishDialog
          onClose={() => setOpen(false)}
          flowId={meta.id}
          flowName={meta.name}
          flowDescription={meta.description}
          unsaved={dirty}
        />
      )}
    </>
  );
}
