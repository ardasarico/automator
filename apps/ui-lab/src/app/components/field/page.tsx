import { Field, FieldDescription, FieldError, FieldLabel } from "@automator/ui/field";
import { Input } from "@automator/ui/input";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Field" };

export default function FieldPage() {
  return (
    <>
      <h1 className="mb-6 text-section">Field</h1>
      <div className="grid max-w-4xl gap-10">
        <section aria-label="Field states" className="grid gap-6 md:grid-cols-2">
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input placeholder="Weekly rebalance" />
          </Field>
          <Field>
            <FieldLabel>Description</FieldLabel>
            <Input placeholder="What does this workflow do?" />
            <FieldDescription>A short summary for your workspace.</FieldDescription>
          </Field>
          <Field invalid>
            <FieldLabel>Email</FieldLabel>
            <Input type="email" defaultValue="hello@" />
            <FieldDescription>Used for execution notifications.</FieldDescription>
            <FieldError match>Enter a valid email address.</FieldError>
          </Field>
          <Field disabled>
            <FieldLabel>Network · disabled</FieldLabel>
            <Input defaultValue="Ethereum" />
            <FieldDescription>The network is fixed for this workflow.</FieldDescription>
          </Field>
        </section>
        <section aria-labelledby="field-surfaces">
          <h2 id="field-surfaces" className="mb-4 text-label">
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
                <Input placeholder="Type something…" />
                <FieldDescription>Supporting text.</FieldDescription>
              </Field>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
