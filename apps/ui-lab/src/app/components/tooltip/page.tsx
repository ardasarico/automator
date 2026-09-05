import { Button } from "@automator/ui/button";
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from "@automator/ui/tooltip";
import { RiInformationLine } from "@remixicon/react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Tooltip" };

export default function TooltipPage() {
  return (
    <>
      <h1 className="mb-6 text-section">Tooltip</h1>
      <TooltipProvider>
        <div className="grid max-w-4xl gap-8">
          <section aria-label="Tooltip placements" className="flex flex-wrap gap-3">
            {(["top", "right", "bottom", "left"] as const).map((side) => (
              <Tooltip key={side}>
                <TooltipTrigger render={<Button variant="secondary" />}>
                  {side.charAt(0).toUpperCase() + side.slice(1)}
                </TooltipTrigger>
                <TooltipPopup side={side}>Tooltip on the {side}</TooltipPopup>
              </Tooltip>
            ))}
          </section>
          <section aria-label="Icon tooltip" className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger
                render={<Button variant="ghost" size="icon" aria-label="Preview information" />}
              >
                <RiInformationLine aria-hidden="true" />
              </TooltipTrigger>
              <TooltipPopup>Changes stay in this preview.</TooltipPopup>
            </Tooltip>
            <p className="text-caption text-muted-foreground">
              Hover or focus with Tab. Press Escape to dismiss.
            </p>
          </section>
        </div>
      </TooltipProvider>
    </>
  );
}
