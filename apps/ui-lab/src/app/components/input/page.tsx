import { Field, FieldDescription, FieldError, FieldLabel } from "@automator/ui/field";
import { Input } from "@automator/ui/input";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Input" };

export default function InputPage() {
  return (
    <>
      <h1 className="mb-6 text-section">Input</h1>
      <div className="grid max-w-4xl gap-10">
        <section aria-label="Input states" className="grid gap-6 md:grid-cols-2">
          <Field>
            <FieldLabel>Workflow name</FieldLabel>
            <Input placeholder="e.g. Weekly rebalance" />
            <FieldDescription>Click or Tab into the input to see focus.</FieldDescription>
          </Field>
          <Field invalid>
            <FieldLabel>Email</FieldLabel>
            <Input type="email" defaultValue="hello@" />
            <FieldError match>Enter a valid email address.</FieldError>
          </Field>
          <Field disabled>
            <FieldLabel>Network · disabled</FieldLabel>
            <Input defaultValue="Ethereum" />
          </Field>
          <Field>
            <FieldLabel>Execution ID · read only</FieldLabel>
            <Input readOnly defaultValue="run_0001" />
          </Field>
        </section>

        <section aria-labelledby="input-sizes">
          <h2 id="input-sizes" className="mb-4 text-label">
            Sizes
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {(["sm", "default", "lg"] as const).map((size) => (
              <Field key={size}>
                <FieldLabel>
                  {size === "sm" ? "Small" : size === "lg" ? "Large" : "Default"}
                </FieldLabel>
                <Input size={size} placeholder="Type something…" />
              </Field>
            ))}
          </div>
        </section>

        <section aria-labelledby="input-surfaces">
          <h2 id="input-surfaces" className="mb-4 text-label">
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
              </Field>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
