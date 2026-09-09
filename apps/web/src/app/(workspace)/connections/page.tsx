import { EmptyStateIllustration } from "@automator/ui/empty-state-illustration";
import { RiPlugLine } from "@remixicon/react";
import type { Metadata } from "next";
import { WorkspaceBreadcrumbs } from "../../../components/workspace-breadcrumbs";
import { WorkspacePage } from "../../../components/workspace-page";

export const metadata: Metadata = { title: "Connections · Automator" };

/**
 * Placeholder route. Secrets and connected apps still live in the settings dialog; moving
 * them here is its own task, and the APIs they need already exist.
 */
export default function ConnectionsPage() {
  return (
    <WorkspacePage>
      <WorkspaceBreadcrumbs current="Connections" />
      <div className="mt-16 flex flex-col items-center gap-3 text-center">
        <EmptyStateIllustration icon={<RiPlugLine aria-hidden="true" className="size-5" />} />
        <p className="text-label">Not moved here yet</p>
        <p className="max-w-sm text-caption text-muted-foreground">
          Secrets and connected apps are still inside the settings dialog. They get their own page
          next.
        </p>
      </div>
    </WorkspacePage>
  );
}
