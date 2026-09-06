import { RiCompass3Line } from "@remixicon/react";
import type { Metadata } from "next";
import { UnavailablePanel } from "../../../components/unavailable-panel";
import { WorkspaceBreadcrumbs } from "../../../components/workspace-breadcrumbs";
import { WorkspacePage } from "../../../components/workspace-page";

export const metadata: Metadata = { title: "Marketplace · Automator" };

export default function MarketplacePage() {
  return (
    <WorkspacePage>
      <WorkspaceBreadcrumbs current="Marketplace" />
      <UnavailablePanel
        icon={<RiCompass3Line />}
        title="The marketplace is not ready yet"
        description="The curated examples are on the Flows page until browsing lands here."
      />
    </WorkspacePage>
  );
}
