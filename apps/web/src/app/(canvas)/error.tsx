"use client";

import { Button } from "@automator/ui/button";
import { RiErrorWarningLine } from "@remixicon/react";
import Link from "next/link";
import { UnavailablePanel } from "../../components/unavailable-panel";

/** The flow could not be read: the panel takes the builder's place rather than the root page. */
export default function CanvasError({ reset }: { error: Error; reset: () => void }) {
  return (
    <UnavailablePanel
      icon={<RiErrorWarningLine />}
      title="This flow could not be loaded"
      description="Something went wrong while loading it. Try again, or go back to your flows."
      action={
        <>
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" render={<Link href="/flows" />}>
            Back to flows
          </Button>
        </>
      }
    />
  );
}
