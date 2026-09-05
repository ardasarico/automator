import { Field, FieldDescription, FieldLabel } from "@automator/ui/field";
import { Switch } from "@automator/ui/switch";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Switch" };

export default function SwitchPage() {
  return (
    <>
      <h1 className="mb-6 text-section">Switch</h1>
      <div className="grid max-w-4xl gap-10">
        <section aria-label="Switch states" className="grid gap-6 md:grid-cols-2">
          <Field>
            <FieldLabel>
              <Switch />
              Automatic execution
            </FieldLabel>
            <FieldDescription>Click the label or press Space to toggle.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>
              <Switch defaultChecked />
              Notifications
            </FieldLabel>
          </Field>
          <Field disabled>
            <FieldLabel>
              <Switch />
              Disabled
            </FieldLabel>
          </Field>
          <Field disabled>
            <FieldLabel>
              <Switch defaultChecked />
              Disabled · on
            </FieldLabel>
          </Field>
        </section>
        <section aria-labelledby="switch-sizes">
          <h2 id="switch-sizes" className="mb-4 text-label">
            Sizes
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            {(["default", "lg"] as const).map((size) => (
              <div key={size} className="grid gap-4">
                <Field>
                  <FieldLabel>
                    <Switch size={size} />
                    {size === "lg" ? "Large" : "Default"}
                  </FieldLabel>
                </Field>
                <Field>
                  <FieldLabel>
                    <Switch size={size} defaultChecked />
                    {size === "lg" ? "Large · checked" : "Default · checked"}
                  </FieldLabel>
                </Field>
              </div>
            ))}
          </div>
        </section>
        <section aria-labelledby="switch-surfaces">
          <h2 id="switch-surfaces" className="mb-4 text-label">
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
                  <Switch defaultChecked />
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
