import { Button } from "@automator/ui/button";
import { Spinner } from "@automator/ui/spinner";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Spinner" };

export default function SpinnerPage() {
  return (
    <>
      <h1 className="mb-6 text-section">Spinner</h1>
      <div className="grid max-w-lg gap-8">
        <section aria-label="Spinner sizes" className="flex items-end gap-8">
          {[
            { label: "Small", size: "size-3" },
            { label: "Default", size: "size-4" },
            { label: "Large", size: "size-6" },
          ].map(({ label, size }) => (
            <div key={label} className="grid justify-items-start gap-3">
              <Spinner className={size} />
              <span className="text-caption text-muted-foreground">{label}</span>
            </div>
          ))}
        </section>
        <section aria-labelledby="spinner-announced">
          <h2 id="spinner-announced" className="mb-3 text-label">
            Announced
          </h2>
          <p className="mb-3 max-w-prose text-caption text-muted-foreground">
            The spinner is decorative by default. Pass <code>label</code> when it is the only sign
            that something is happening, and it becomes a live status under that name.
          </p>
          <div className="flex flex-wrap items-center gap-5">
            <Spinner className="size-5" />
            <Spinner className="size-5" label="Loading activity" />
          </div>
        </section>
        <section aria-labelledby="spinner-context">
          <h2 id="spinner-context" className="mb-3 text-label">
            In context
          </h2>
          <div className="flex flex-wrap items-center gap-5">
            <Button disabled>
              <Spinner />
              Saving
            </Button>
            <Button variant="secondary" disabled>
              <Spinner />
              Simulating
            </Button>
            <span className="flex items-center gap-2 text-caption text-muted-foreground">
              <Spinner className="size-4" />
              Loading activity
            </span>
          </div>
        </section>
      </div>
    </>
  );
}
