import { Field, FieldDescription, FieldError, FieldLabel } from "@automator/ui/field";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@automator/ui/select";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Select" };

const networks = [
  { value: "ethereum", label: "Ethereum" },
  { value: "arbitrum", label: "Arbitrum" },
  { value: "base", label: "Base" },
  { value: "optimism", label: "Optimism · unavailable", disabled: true },
];

function NetworkSelect({
  defaultValue,
  size = "default",
  disabled = false,
}: {
  defaultValue?: string;
  size?: "sm" | "default" | "lg";
  disabled?: boolean;
}) {
  return (
    <Select items={networks} defaultValue={defaultValue} disabled={disabled}>
      <SelectTrigger size={size}>
        <SelectValue placeholder="Choose a network…" />
      </SelectTrigger>
      <SelectPopup>
        {networks.map(({ value, label, disabled: itemDisabled }) => (
          <SelectItem key={value} value={value} disabled={itemDisabled}>
            {label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}

export default function SelectPage() {
  return (
    <>
      <h1 className="mb-6 text-section">Select</h1>
      <div className="grid max-w-4xl gap-10">
        <section aria-label="Select states" className="grid gap-6 md:grid-cols-2">
          <Field>
            <FieldLabel>Network</FieldLabel>
            <NetworkSelect />
            <FieldDescription>
              Use arrow keys to navigate, Enter to select, and Esc to close.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Network · selected</FieldLabel>
            <NetworkSelect defaultValue="ethereum" />
          </Field>
          <Field invalid>
            <FieldLabel>Network · error</FieldLabel>
            <NetworkSelect />
            <FieldError match>Choose a network to continue.</FieldError>
          </Field>
          <Field disabled>
            <FieldLabel>Network · disabled</FieldLabel>
            <NetworkSelect disabled defaultValue="ethereum" />
          </Field>
        </section>

        <section aria-labelledby="select-sizes">
          <h2 id="select-sizes" className="mb-4 text-label">
            Sizes
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {(["sm", "default", "lg"] as const).map((size) => (
              <Field key={size}>
                <FieldLabel>
                  {size === "sm" ? "Small" : size === "lg" ? "Large" : "Default"}
                </FieldLabel>
                <NetworkSelect size={size} defaultValue="ethereum" />
              </Field>
            ))}
          </div>
        </section>

        <section aria-labelledby="select-surfaces">
          <h2 id="select-surfaces" className="mb-4 text-label">
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
                <NetworkSelect defaultValue="ethereum" />
              </Field>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
