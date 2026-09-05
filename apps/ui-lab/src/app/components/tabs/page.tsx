import { Tabs, TabsList, TabsPanel, TabsTab } from "@automator/ui/tabs";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Tabs" };

export default function TabsPage() {
  return (
    <>
      <h1 className="mb-6 text-section">Tabs</h1>
      <div className="grid max-w-2xl gap-8">
        {(["default", "underline"] as const).map((variant) => (
          <section key={variant} aria-labelledby={`tabs-${variant}`}>
            <h2 id={`tabs-${variant}`} className="mb-3 text-label">
              {variant === "default" ? "Default" : "Underline"}
            </h2>
            <Tabs defaultValue="overview">
              <TabsList variant={variant} aria-label={`${variant} example`}>
                <TabsTab value="overview">Overview</TabsTab>
                <TabsTab value="activity">Activity</TabsTab>
                <TabsTab value="settings" disabled>
                  Settings
                </TabsTab>
              </TabsList>
              <TabsPanel value="overview" className="py-3 text-body text-muted-foreground">
                Build, simulate, and run a workflow.
              </TabsPanel>
              <TabsPanel value="activity" className="py-3 text-body text-muted-foreground">
                The latest simulation completed successfully.
              </TabsPanel>
            </Tabs>
          </section>
        ))}
        <section aria-labelledby="tabs-sizes">
          <h2 id="tabs-sizes" className="mb-3 text-label">
            Sizes
          </h2>
          <div className="flex flex-wrap items-start gap-4">
            {(["sm", "default", "lg"] as const).map((size) => (
              <Tabs key={size} defaultValue="preview">
                <TabsList size={size} aria-label={`${size} tabs`}>
                  <TabsTab value="preview">Preview</TabsTab>
                  <TabsTab value="code">Code</TabsTab>
                </TabsList>
                <TabsPanel value="preview" className="text-caption text-muted-foreground">
                  Preview selected
                </TabsPanel>
                <TabsPanel value="code" className="text-caption text-muted-foreground">
                  Code selected
                </TabsPanel>
              </Tabs>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
