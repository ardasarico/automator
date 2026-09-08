"use client";

import { Button } from "@automator/ui/button";
import { RiErrorWarningLine } from "@remixicon/react";
import { UnavailablePanel } from "../../components/unavailable-panel";
import { WorkspaceBreadcrumbs } from "../../components/workspace-breadcrumbs";
import { WorkspacePage } from "../../components/workspace-page";

export default function WorkspaceError({ retry }: { error: Error; retry: () => void }) {
  return (
    <WorkspacePage>
      <WorkspaceBreadcrumbs current="Something went wrong" />
      <UnavailablePanel
        icon={<RiErrorWarningLine />}
        title="This page could not load"
        description="Something went wrong while loading it. Try again, or go back to your flows."
        action={<Button onClick={retry}>Try again</Button>}
      />
    </WorkspacePage>
  );
}
