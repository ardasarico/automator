import { Badge } from "@automator/ui/badge";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Badge" };

export default function BadgePage() {
  return (
    <>
      <h1 className="mb-6 text-section">Badge</h1>
      <div className="grid max-w-3xl gap-8">
        <section aria-label="Badge variants" className="flex flex-wrap items-center gap-3">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="error">Error</Badge>
          <Badge variant="info">Info</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
        </section>
        <section aria-labelledby="badge-sizes">
          <h2 id="badge-sizes" className="mb-3 text-label">
            Sizes
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <Badge size="sm">Small</Badge>
            <Badge>Default</Badge>
            <Badge size="lg">Large</Badge>
          </div>
        </section>
        <section aria-labelledby="badge-surfaces">
          <h2 id="badge-surfaces" className="mb-3 text-label">
            Surfaces
          </h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { label: "Canvas", background: "bg-background" },
              { label: "Panel", background: "bg-card" },
              { label: "Elevated", background: "bg-popover" },
            ].map(({ label, background }) => (
              <div key={label} className={`space-y-3 p-3.5 ${background}`}>
                <p className="text-caption text-muted-foreground">{label}</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">Draft</Badge>
                  <Badge variant="success">Ready</Badge>
                  <Badge variant="outline">v1</Badge>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
