import { RiCompassDiscoverLine } from "@remixicon/react";
import type { Metadata } from "next";
import { PageFrame } from "../../components/page-frame";
import { UnavailablePanel } from "../../components/unavailable-panel";

export const metadata: Metadata = { title: "Not found · Automator" };

export default function WorkspaceNotFound() {
  return (
    <PageFrame title="Not found">
      <UnavailablePanel
        icon={<RiCompassDiscoverLine />}
        title="This page does not exist"
        description="The link may be out of date, or the flow may have been removed."
      />
    </PageFrame>
  );
}
