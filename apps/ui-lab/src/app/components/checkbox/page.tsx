import { Checkbox } from "@automator/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@automator/ui/field";
import type { Metadata } from "next";
import { IndeterminateCheckbox } from "./indeterminate-checkbox";

export const metadata: Metadata = { title: "Checkbox" };

export default function CheckboxPage() {
  return (
    <>
      <h1 className="mb-6 text-section">Checkbox</h1>
      <div className="grid max-w-4xl gap-10">
        <section aria-label="Checkbox states" className="grid gap-6 md:grid-cols-2">
          <Field>
            <FieldLabel>
              <Checkbox />
              Send notifications
            </FieldLabel>
            <FieldDescription>Click the label or press Space to toggle.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>
              <Checkbox defaultChecked />
              Simulate before execution
            </FieldLabel>
          </Field>
          <Field>
            <FieldLabel>
              <IndeterminateCheckbox />
              Partially selected
            </FieldLabel>
          </Field>
          <Field invalid>
            <FieldLabel>
              <Checkbox aria-invalid="true" />
              Accept the conditions
            </FieldLabel>
            <FieldError match>Accept the conditions to continue.</FieldError>
          </Field>
          <Field disabled>
            <FieldLabel>
              <Checkbox />
              Disabled
            </FieldLabel>
          </Field>
          <Field disabled>
            <FieldLabel>
              <Checkbox defaultChecked />
              Disabled · checked
            </FieldLabel>
          </Field>
        </section>
        <section aria-labelledby="checkbox-surfaces">
          <h2 id="checkbox-surfaces" className="mb-4 text-label">
            Surfaces
          </h2>
          <div className="grid gap-2 md:grid-cols-3">
            {[
              { label: "Canvas", background: "bg-background" },
              { label: "Panel", background: "bg-card" },
              { label: "Elevated", background: "bg-popover" },
            ].map(({ label, background }) => (
              <Field key={label} className={`p-3.5 ${background}`}>
                <FieldLabel>
                  <Checkbox defaultChecked />
                  {label}
                </FieldLabel>
              </Field>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
