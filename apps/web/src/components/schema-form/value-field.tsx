"use client";

import { Field, FieldLabel } from "@automator/ui/field";
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectPrimitive,
  SelectSeparator,
} from "@automator/ui/select";
import { RiArrowDownSLine } from "@remixicon/react";
import { useState } from "react";
import { Help, StringField } from "./fields";
import { singleTemplate, type FieldProps, type VariableOption } from "./schema";
import styles from "./value-field.module.css";

/** The item that hands the field back to the reader as plain text. */
const typeYourOwn = "__type_your_own__";

/**
 * A single-line setting that usually holds one value from an earlier step. While it does, the
 * reader sees a list of those values by name ("Selfie check → Verified") instead of the template
 * behind it; "Type your own…" turns it back into the text field, where the `{ }` menu still
 * inserts a template into whatever is typed. Picking a whole value there brings the list back.
 */
export function ValueField({
  id,
  name,
  label,
  property,
  value,
  onChange,
  variables = [],
}: Omit<FieldProps, "path" | "problems"> & { label: string }) {
  const text = typeof value === "string" ? value : "";
  const template = singleTemplate(text);
  const [mode, setMode] = useState<"auto" | "text">("auto");
  const picking = mode === "auto" && template !== null;

  if (!picking)
    return (
      <StringField
        id={id}
        name={name}
        label={label}
        property={property}
        value={value}
        variables={variables}
        onChange={(next) => {
          /* A whole value picked from the `{ }` menu is what the list is for, so it comes back;
           * text typed around one stays text. */
          if (typeof next === "string" && singleTemplate(next) !== null && template === null)
            setMode("auto");
          onChange(next);
        }}
      />
    );

  const current = variables.find((option) => option.template === template);
  const known = current !== undefined;
  const groups = new Map<string, VariableOption[]>();
  for (const option of variables)
    groups.set(option.source, [...(groups.get(option.source) ?? []), option]);
  const items = [
    ...variables.map((option) => ({ value: option.template, label: describe(option) })),
    ...(known ? [] : [{ value: template, label: template }]),
    { value: typeYourOwn, label: "Type your own…" },
  ];

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        items={items}
        value={template}
        onValueChange={(next) => {
          if (next === typeYourOwn) setMode("text");
          else if (typeof next === "string") onChange(next);
        }}
      >
        {/* Not the stock trigger, which looks like an input: a token with a visible handle. */}
        <SelectPrimitive.Trigger id={id} className={styles.trigger} data-slot="select-trigger">
          <span className={styles.source}>{current ? current.source : "Typed"}</span>
          <span className={current ? styles.value : `${styles.value} ${styles.raw}`}>
            {current ? current.label : template}
          </span>
          <span className={styles.change} aria-hidden="true">
            Change
            <RiArrowDownSLine />
          </span>
        </SelectPrimitive.Trigger>
        <SelectPopup>
          {[...groups].map(([source, options]) => (
            <SelectGroup key={source}>
              <SelectGroupLabel>{source}</SelectGroupLabel>
              {options.map((option) => (
                <SelectItem key={option.template} value={option.template}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
          {!known && (
            <SelectGroup>
              <SelectGroupLabel>Typed</SelectGroupLabel>
              <SelectItem value={template}>
                <span className="font-mono text-xs">{template}</span>
              </SelectItem>
            </SelectGroup>
          )}
          <SelectSeparator />
          <SelectItem value={typeYourOwn}>Type your own…</SelectItem>
        </SelectPopup>
      </Select>
      <Help text={property.description} />
    </Field>
  );
}

/** How a picked value reads on the closed control: where it comes from, then what it is. */
function describe(option: VariableOption): string {
  return `${option.source} → ${option.label}`;
}
