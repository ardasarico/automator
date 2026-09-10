import { RiCompassDiscoverLine } from "@remixicon/react";
import type { Metadata } from "next";
import { UnavailablePanel } from "../components/unavailable-panel";

export const metadata: Metadata = { title: "Not found · Automator" };

/** A URL outside every route group: no shell to draw, so the panel owns the viewport. */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col bg-background">
      <UnavailablePanel
        icon={<RiCompassDiscoverLine />}
        title="This page does not exist"
        description="The link may be out of date, or the page may have moved."
      />
    </main>
  );
}
