"use client";

import { Checkbox } from "@automator/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@automator/ui/field";
import styles from "./multi-select-field.module.css";

export function MultiSelectField({
  id,
  label,
  options,
  value,
  description,
  onChange,
}: {
  id: string;
  label: string;
  options: readonly string[];
  value: unknown;
  description?: string;
  onChange(value: string[]): void;
}) {
  const selected = new Set(Array.isArray(value) ? value.filter((v) => typeof v === "string") : []);
  function toggle(option: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(option);
    else next.delete(option);
    onChange(options.filter((candidate) => next.has(candidate)));
  }
  return (
    <Field>
      <FieldLabel id={`${id}-label`}>{label}</FieldLabel>
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        className={styles.multiSelect}
        data-testid={id}
      >
        {options.map((option) => (
          <label key={option} className={styles.multiSelectOption}>
            <Checkbox
              checked={selected.has(option)}
              onCheckedChange={(checked) => toggle(option, checked === true)}
            />
            <span>{humanizeOption(option)}</span>
          </label>
        ))}
        {options.length === 0 && (
          <span className="text-caption text-muted-foreground">No options available.</span>
        )}
      </div>
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  );
}

export function humanizeOption(option: string) {
  const words = option.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
