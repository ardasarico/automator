"use client";

import { Badge } from "@automator/ui/badge";
import { Button } from "@automator/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@automator/ui/tooltip";
import { RiSaveLine } from "@remixicon/react";
import { WorkspaceBreadcrumbs } from "../components/workspace-breadcrumbs";
import { useBuilderStore } from "./store-provider";

/** Breadcrumbs with the flow name, draft state, and a Save that waits for the API. */
export function BuilderToolbar() {
  const dirty = useBuilderStore((state) => state.dirty);
  const name = useBuilderStore((state) => state.meta.name);

  return (
    <div className="flex flex-none flex-wrap items-center justify-between gap-3 border-b px-4 py-2">
      <WorkspaceBreadcrumbs parents={[{ label: "Flows", href: "/flows" }]} current={name} />
      <div className="flex items-center gap-3">
        <Badge variant={dirty ? "warning" : "outline"}>
          {dirty ? "Unsaved changes" : "Local draft"}
        </Badge>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                aria-disabled="true"
                className="opacity-64"
                onClick={(event) => event.preventDefault()}
              />
            }
          >
            <RiSaveLine aria-hidden="true" />
            Save
          </TooltipTrigger>
          <TooltipPopup>Saving arrives with the API</TooltipPopup>
        </Tooltip>
      </div>
    </div>
  );
}
