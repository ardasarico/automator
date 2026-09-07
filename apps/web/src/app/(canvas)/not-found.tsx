import { RiCompassDiscoverLine } from "@remixicon/react";
import type { Metadata } from "next";
import { UnavailablePanel } from "../../components/unavailable-panel";

export const metadata: Metadata = { title: "Flow not found · Automator" };

/** Shown when the visitor has no flow with the requested id. */
export default function CanvasNotFound() {
  return (
    <UnavailablePanel
      icon={<RiCompassDiscoverLine />}
      title="This flow does not exist"
      description="The link may be out of date, or the flow may belong to another account."
    />
  );
}
