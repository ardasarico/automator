"use client";

import { Button } from "@automator/ui/button";
import { RiErrorWarningLine } from "@remixicon/react";
import { PageFrame } from "../../components/page-frame";
import { UnavailablePanel } from "../../components/unavailable-panel";

export default function WorkspaceError({ retry }: { error: Error; retry: () => void }) {
  return (
    <PageFrame title="Something went wrong">
      <UnavailablePanel
        icon={<RiErrorWarningLine />}
        title="This page could not load"
        description="Something went wrong while loading it. Try again, or go back to your flows."
        action={<Button onClick={retry}>Try again</Button>}
      />
    </PageFrame>
  );
}
