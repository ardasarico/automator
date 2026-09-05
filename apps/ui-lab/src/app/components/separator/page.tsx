import { Separator } from "@automator/ui/separator";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Separator" };

export default function SeparatorPage() {
  return (
    <>
      <h1 className="mb-6 text-section">Separator</h1>
      <div className="grid max-w-lg gap-8">
        <section aria-labelledby="separator-horizontal" className="space-y-4">
          <h2 id="separator-horizontal" className="text-label">
            Horizontal
          </h2>
          <p className="text-body text-muted-foreground">Workflow details</p>
          <Separator />
          <p className="text-body text-muted-foreground">Execution history</p>
        </section>
        <section aria-labelledby="separator-vertical">
          <h2 id="separator-vertical" className="mb-4 text-label">
            Vertical
          </h2>
          <div className="flex h-5 items-center gap-4 text-caption text-muted-foreground">
            <span>Draft</span>
            <Separator orientation="vertical" />
            <span>Ethereum</span>
            <Separator orientation="vertical" />
            <span>3 steps</span>
          </div>
        </section>
      </div>
    </>
  );
}
