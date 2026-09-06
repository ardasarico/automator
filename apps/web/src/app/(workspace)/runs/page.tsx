import { RiPlayCircleLine } from "@remixicon/react";
import type { Metadata } from "next";
import { UnavailablePanel } from "../../../components/unavailable-panel";
import { WorkspaceBreadcrumbs } from "../../../components/workspace-breadcrumbs";
import { WorkspacePage } from "../../../components/workspace-page";

export const metadata: Metadata = { title: "Runs · Automator" };

export default function RunsPage() {
  return (
    <WorkspacePage>
      <WorkspaceBreadcrumbs current="Runs" />
      <UnavailablePanel
        icon={<RiPlayCircleLine />}
        title="Run history is not ready yet"
        description="Once flows can execute, every run and its steps will be listed here."
      />
    </WorkspacePage>
  );
}
