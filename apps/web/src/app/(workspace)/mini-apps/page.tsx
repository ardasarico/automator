import { EmptyStateIllustration } from "@automator/ui/empty-state-illustration";
import { RiAppsLine } from "@remixicon/react";
import type { Metadata } from "next";
import { PageFrame } from "../../../components/page-frame";

export const metadata: Metadata = { title: "Mini-apps · Automator" };

/**
 * Placeholder route. Flows can already be shared as mini-apps from the builder; this page
 * will list what is live, with its link and recent sessions.
 */
export default function MiniAppsPage() {
  return (
    <PageFrame title="Mini-apps">
      <div className="mt-16 flex flex-col items-center gap-3 text-center">
        <EmptyStateIllustration icon={<RiAppsLine aria-hidden="true" className="size-5" />} />
        <p className="text-label">Nothing listed yet</p>
        <p className="max-w-sm text-caption text-muted-foreground">
          Share a flow from the builder and it will show up here with its link and its recent
          sessions.
        </p>
      </div>
    </PageFrame>
  );
}
