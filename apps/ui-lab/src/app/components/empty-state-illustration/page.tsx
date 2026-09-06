import { EmptyStateIllustration } from "@automator/ui/empty-state-illustration";
import { RiFlowChart, RiPlayCircleLine, RiTeamLine } from "@remixicon/react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Empty State Illustration" };

export default function EmptyStateIllustrationPage() {
  return (
    <>
      <h1 className="mb-6 text-section">Empty State Illustration</h1>
      <div className="grid gap-10">
        <section aria-label="Icon examples" className="flex flex-wrap gap-10">
          <div className="grid justify-items-center gap-3">
            <EmptyStateIllustration icon={<RiFlowChart />} />
            <span className="text-caption text-muted-foreground">Flows</span>
          </div>
          <div className="grid justify-items-center gap-3">
            <EmptyStateIllustration icon={<RiTeamLine />} />
            <span className="text-caption text-muted-foreground">Team</span>
          </div>
          <div className="grid justify-items-center gap-3">
            <EmptyStateIllustration icon={<RiPlayCircleLine />} />
            <span className="text-caption text-muted-foreground">Runs</span>
          </div>
        </section>
        <section
          aria-labelledby="empty-state-context"
          className="rounded-2xl border border-border bg-muted px-6 py-12 text-center"
        >
          <EmptyStateIllustration icon={<RiFlowChart />} className="mb-6" />
          <h2 id="empty-state-context" className="text-panel">
            Create your first flow
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-body text-muted-foreground">
            Start with a blank canvas, or make an example your own.
          </p>
        </section>
        <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-code">
          <code>{`import { EmptyStateIllustration } from "@automator/ui/empty-state-illustration";
import { RiFlowChart } from "@remixicon/react";

<EmptyStateIllustration icon={<RiFlowChart />} />`}</code>
        </pre>
      </div>
    </>
  );
}
