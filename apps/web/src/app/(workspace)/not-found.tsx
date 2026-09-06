import { RiCompassDiscoverLine } from "@remixicon/react";
import type { Metadata } from "next";
import { UnavailablePanel } from "../../components/unavailable-panel";
import { WorkspaceBreadcrumbs } from "../../components/workspace-breadcrumbs";
import { WorkspacePage } from "../../components/workspace-page";

export const metadata: Metadata = { title: "Not found · Automator" };

export default function WorkspaceNotFound() {
  return (
    <WorkspacePage>
      <WorkspaceBreadcrumbs current="Not found" />
      <UnavailablePanel
        icon={<RiCompassDiscoverLine />}
        title="This page does not exist"
        description="The link may be out of date, or the flow may have been removed."
      />
    </WorkspacePage>
  );
}
