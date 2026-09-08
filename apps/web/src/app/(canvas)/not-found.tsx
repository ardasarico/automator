import { RiCompassDiscoverLine } from "@remixicon/react";
import type { Metadata } from "next";
import { UnavailablePanel } from "../../components/unavailable-panel";

export const metadata: Metadata = { title: "Flow not found · Automator" };

export default function CanvasNotFound() {
  return (
    <UnavailablePanel
      icon={<RiCompassDiscoverLine />}
      title="This flow does not exist"
      description="The link may be out of date, or the flow may belong to another account."
    />
  );
}
