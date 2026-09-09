import { EmptyStateIllustration } from "@automator/ui/empty-state-illustration";
import { RiSettings3Line } from "@remixicon/react";
import type { Metadata } from "next";
import { PageFrame } from "../../../components/page-frame";

export const metadata: Metadata = { title: "Settings · Automator" };

/**
 * Placeholder route. Settings still open as a dialog from the account menu; this page takes
 * them over once Connections has claimed the secrets and connected apps sections.
 */
export default function SettingsPage() {
  return (
    <PageFrame title="Settings">
      <div className="mt-16 flex flex-col items-center gap-3 text-center">
        <EmptyStateIllustration icon={<RiSettings3Line aria-hidden="true" className="size-5" />} />
        <p className="text-label">Still a dialog</p>
        <p className="max-w-sm text-caption text-muted-foreground">
          Settings open from the account menu at the bottom of the sidebar. They move onto this page
          after Connections takes the secrets and connected apps.
        </p>
      </div>
    </PageFrame>
  );
}
