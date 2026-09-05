import { Field, FieldDescription, FieldError, FieldLabel } from "@automator/ui/field";
import { Textarea } from "@automator/ui/textarea";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Textarea" };

export default function TextareaPage() {
  return (
    <>
      <h1 className="mb-6 text-section">Textarea</h1>
      <div className="grid max-w-4xl gap-10">
        <section aria-label="Textarea states" className="grid gap-6 md:grid-cols-2">
          <Field>
            <FieldLabel>Description</FieldLabel>
            <Textarea placeholder="Describe what this workflow does…" />
            <FieldDescription>Grows with your text. Click or Tab in to see focus.</FieldDescription>
          </Field>
          <Field invalid>
            <FieldLabel>Description · error</FieldLabel>
            <Textarea placeholder="Describe the workflow…" required />
            <FieldError match>A description is required.</FieldError>
          </Field>
          <Field disabled>
            <FieldLabel>Notes · disabled</FieldLabel>
            <Textarea defaultValue="Notes are unavailable while this workflow is running." />
          </Field>
          <Field>
            <FieldLabel>Summary · read only</FieldLabel>
            <Textarea
              readOnly
              defaultValue="Rebalance the portfolio once a week. Simulate each run before execution."
            />
          </Field>
        </section>

        <section aria-labelledby="textarea-sizes">
          <h2 id="textarea-sizes" className="mb-4 text-label">
            Sizes
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {(["sm", "default", "lg"] as const).map((size) => (
              <Field key={size}>
                <FieldLabel>
                  {size === "sm" ? "Small" : size === "lg" ? "Large" : "Default"}
                </FieldLabel>
                <Textarea size={size} placeholder="Write a few lines…" />
              </Field>
            ))}
          </div>
        </section>

        <section aria-labelledby="textarea-surfaces">
          <h2 id="textarea-surfaces" className="mb-4 text-label">
            Surfaces
          </h2>
          <div className="grid gap-2 md:grid-cols-3">
            {[
              { label: "Canvas", background: "bg-background" },
              { label: "Panel", background: "bg-card" },
              { label: "Elevated", background: "bg-popover" },
            ].map(({ label, background }) => (
              <Field key={label} className={`p-3.5 ${background}`}>
                <FieldLabel>{label}</FieldLabel>
                <Textarea placeholder="Write a few lines…" />
              </Field>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
