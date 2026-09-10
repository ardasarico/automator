"use client";

import { samplePayloadProblem, Value, type TSchema } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { Field, FieldDescription, FieldLabel } from "@automator/ui/field";
import { Input } from "@automator/ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@automator/ui/select";
import { Switch } from "@automator/ui/switch";
import { Textarea } from "@automator/ui/textarea";
import { RiAddLine, RiArrowDownLine, RiArrowUpLine, RiDeleteBinLine } from "@remixicon/react";
import { useEffect, useRef, useState } from "react";
import { ColumnRefField, OperatorField, TableRefField } from "./data-ref-fields";
import styles from "./fields.module.css";
import { isVisible, sectionFields } from "./layout";
import { MultiSelectField } from "./multi-select-field";
import {
  fieldLabel,
  humanize,
  insertTemplate,
  isRecord,
  itemTitle,
  singular,
  textFieldShape,
  type FieldContext,
  type FieldProblems,
  type FieldProps,
  type Property,
  type TextSelection,
  type VariableOption,
} from "./schema";
import { ValueField } from "./value-field";
import { VariablePicker } from "./variable-picker";

/** Put on a form to show each field's description only while that field is hovered or focused. */
export const quietHelpClass: string = styles.quietHelp!;

/**
 * A field's description. The class lets a form hide it until the field is hovered or focused
 * (`.quietHelp` in the stylesheet); on its own it always shows.
 */
export function Help({ text }: { text: string | undefined }) {
  return text ? <FieldDescription className="schema-help">{text}</FieldDescription> : null;
}

export function ConfigField(props: FieldProps) {
  const problem = props.path !== undefined ? props.problems?.[props.path] : undefined;
  /* A JSON field reports its own syntax problem as the reader types, so the flow check's copy of
   * it would only say the same thing twice. */
  const ownsProblem = props.property.contentMediaType === "application/json";
  /* The wrapper is there whether or not a problem is, so a problem appearing does not remount the
   * control under the reader's caret. Not Base UI's FieldError: that reads validity from a Field
   * root, and this comes from the flow checks, not the control. */
  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <ConfigControl {...props} />
      {problem && !ownsProblem && (
        <p
          role={problem.severity === "error" ? "alert" : "status"}
          className={`text-xs ${problem.severity === "error" ? "text-destructive-text" : "text-warning-foreground"}`}
        >
          {problem.message}
        </p>
      )}
    </div>
  );
}

function ConfigControl({
  id,
  name,
  property,
  value,
  onChange,
  variables = [],
  context,
  path,
  problems,
}: FieldProps) {
  const label = fieldLabel(name, property);
  const options = property.anyOf
    ?.map((option) => option.const)
    .filter((option): option is string => typeof option === "string");

  if (options && options.length > 0) {
    if (property.operatorFor) {
      return (
        <OperatorField
          id={id}
          label={label}
          property={property}
          options={options}
          value={value}
          onChange={onChange}
          context={context}
        />
      );
    }
    return (
      <Field>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Select
          items={options.map((option) => ({ value: option, label: humanize(option) }))}
          value={typeof value === "string" ? value : options[0]!}
          onValueChange={(next) => onChange(next)}
        >
          <SelectTrigger id={id} size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {humanize(option)}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <Help text={property.description} />
      </Field>
    );
  }
  if (property.type === "boolean") {
    return (
      <Field>
        <div className="flex w-full items-center justify-between gap-2">
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <Switch id={id} checked={value === true} onCheckedChange={onChange} />
        </div>
        <Help text={property.description} />
      </Field>
    );
  }
  if (property.type === "number" || property.type === "integer") {
    return (
      <Field>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Input
          id={id}
          type="number"
          size="sm"
          min={property.minimum}
          max={property.maximum}
          step={property.type === "integer" ? 1 : "any"}
          value={typeof value === "number" && Number.isFinite(value) ? value : ""}
          onChange={(event) =>
            onChange(event.target.value === "" ? "" : event.target.valueAsNumber)
          }
        />
        <Help text={property.description} />
      </Field>
    );
  }
  if (property.tableRef) {
    return (
      <TableRefField id={id} label={label} property={property} value={value} onChange={onChange} />
    );
  }
  if (property.columnRef) {
    return (
      <ColumnRefField
        id={id}
        label={label}
        property={property}
        value={value}
        onChange={onChange}
        context={context}
      />
    );
  }
  if (property.type === "string" && property.contentMediaType === "application/json") {
    return (
      <JsonField id={id} label={label} property={property} value={value} onChange={onChange} />
    );
  }
  if (property.type === "string" && property.format === "date-time") {
    return (
      <DateTimeField id={id} label={label} property={property} value={value} onChange={onChange} />
    );
  }
  if (property.type === "string") {
    /* A one-line setting with values to pick from gets the list; prose and code stay text. */
    const Component =
      variables.length > 0 && textFieldShape(name, property) === "line" ? ValueField : StringField;
    return (
      <Component
        id={id}
        name={name}
        label={label}
        property={property}
        value={value}
        onChange={onChange}
        variables={variables}
      />
    );
  }
  if (property.type === "array" && property.items?.anyOf) {
    const options = property.items.anyOf
      .map((option) => option.const)
      .filter((option): option is string => typeof option === "string");
    return (
      <MultiSelectField
        id={id}
        label={label}
        options={options}
        value={value}
        description={property.description}
        onChange={onChange}
      />
    );
  }
  if (property.type === "array" && property.items?.type === "string") {
    return (
      <StringListField
        id={id}
        label={label}
        property={property}
        value={value}
        onChange={onChange}
      />
    );
  }
  if (property.type === "array" && property.items?.properties) {
    return (
      <ArrayField
        id={id}
        label={label}
        property={property}
        value={value}
        onChange={onChange}
        variables={variables}
        context={context}
        path={path}
        problems={problems}
      />
    );
  }
  if (property.type === "object" && property.properties) {
    return (
      <Group label={label} description={property.description}>
        <ObjectFields
          id={id}
          properties={property.properties}
          value={value}
          onChange={(patch) => onChange({ ...(isRecord(value) ? value : {}), ...patch })}
          variables={variables}
          context={context}
          path={path}
          problems={problems}
        />
      </Group>
    );
  }
  return <p className="text-caption text-muted-foreground">{label} is not editable here yet.</p>;
}

/**
 * A string setting, and the only field a variable can be picked into. It remembers where the caret
 * was so a pick lands there instead of trailing the value the field already holds, and it gives
 * prose and code the room a single line never had.
 */
export function StringField({
  id,
  name,
  label,
  property,
  value,
  onChange,
  variables = [],
}: Omit<FieldProps, "path" | "problems"> & { label: string }) {
  const text = typeof value === "string" ? value : "";
  const shape = textFieldShape(name, property);
  const control = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const selection = useRef<TextSelection | null>(null);
  const pending = useRef<number | null>(null);

  /* The menu takes focus while it is open, so the pick hands it back where the text now ends. */
  useEffect(() => {
    const caret = pending.current;
    const element = control.current;
    pending.current = null;
    if (caret === null || !element) return;
    element.focus();
    element.setSelectionRange(caret, caret);
    selection.current = { start: caret, end: caret };
  });

  const track = (element: HTMLInputElement | HTMLTextAreaElement) => {
    selection.current = { start: element.selectionStart ?? 0, end: element.selectionEnd ?? 0 };
  };
  const shared = {
    id,
    ref: (element: HTMLInputElement | HTMLTextAreaElement | null) => {
      control.current = element;
    },
    value: text,
    onSelect: (event: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      track(event.currentTarget),
    onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      track(event.currentTarget),
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      track(event.currentTarget);
      onChange(event.target.value);
    },
  };

  return (
    <Field>
      <div className="flex w-full items-center justify-between gap-2">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {variables.length > 0 && (
          <VariablePicker
            options={variables}
            onPick={(template) => {
              const next = insertTemplate(text, template, selection.current ?? undefined);
              pending.current = next.caret;
              onChange(next.text);
            }}
          />
        )}
      </div>
      {shape === "line" ? (
        <Input
          {...shared}
          size="sm"
          placeholder={property.secret ? "{{secrets.name}}" : undefined}
        />
      ) : (
        <Textarea
          {...shared}
          rows={shape === "code" ? 10 : 4}
          spellCheck={shape === "code" ? false : undefined}
          className={shape === "code" ? "min-h-32 font-mono text-xs sm:text-xs" : undefined}
        />
      )}
      <Help
        text={
          property.secret
            ? `${property.description ? `${property.description} ` : ""}Keep it out of the flow: store it in Variables and reference it as {{secrets.name}}.`
            : property.description
        }
      />
    </Field>
  );
}

export function JsonField({
  id,
  label,
  property,
  value,
  onChange,
}: Omit<FieldProps, "name" | "path" | "problems"> & { label: string }) {
  const text = typeof value === "string" ? value : "";
  const problem = samplePayloadProblem(text);
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        id={id}
        rows={6}
        spellCheck={false}
        className="font-mono text-xs sm:text-xs"
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? `${id}-error` : undefined}
        value={text}
        onChange={(event) => onChange(event.target.value)}
      />
      {problem && (
        <p id={`${id}-error`} className="text-xs text-destructive-text" aria-live="polite">
          {problem}
        </p>
      )}
      <Help text={property.description} />
    </Field>
  );
}

const pad = (part: number, width = 2) => String(part).padStart(width, "0");

/** A stored instant as the local wall time `datetime-local` shows; anything undateable reads blank. */
export function toLocalInput(stored: string): string {
  const date = new Date(stored);
  if (Number.isNaN(date.getTime())) return "";
  const day = `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The local wall time the control reports, stored back as UTC; a half-typed entry reports "". */
export function fromLocalInput(local: string): string {
  const date = new Date(local);
  return local === "" || Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/**
 * An instant, edited in the reader's own timezone and stored as a UTC ISO string. The control keeps
 * what it displays, so a half-typed date reports "" without the field fighting the keystrokes.
 */
export function DateTimeField({
  id,
  label,
  property,
  value,
  onChange,
}: Omit<FieldProps, "name" | "path" | "problems"> & { label: string }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="datetime-local"
        size="sm"
        value={toLocalInput(typeof value === "string" ? value : "")}
        onChange={(event) => onChange(fromLocalInput(event.target.value))}
      />
      <Help text={property.description} />
    </Field>
  );
}

export function StringListField({
  id,
  label,
  property,
  value,
  onChange,
}: Omit<FieldProps, "name" | "path" | "problems"> & { label: string }) {
  const text = Array.isArray(value) ? value.filter((v) => typeof v === "string").join(", ") : "";
  const [draft, setDraft] = useState({ stored: text, text });
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        size="sm"
        value={draft.stored === text ? draft.text : text}
        placeholder="One, two, three"
        onChange={(event) => {
          const input = event.target.value;
          const items = input
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item !== "");
          setDraft({ stored: items.join(", "), text: input });
          onChange(items);
        }}
      />
      <Help text={property.description ?? "Separate items with commas."} />
    </Field>
  );
}

export function Group({
  label,
  description,
  actions,
  children,
}: {
  label: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2 rounded-lg border p-2">
      <div className="flex items-center gap-1">
        <legend className="contents">
          <span className="min-w-0 flex-1 truncate text-caption font-medium">{label}</span>
        </legend>
        {actions}
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      {children}
    </fieldset>
  );
}

export function ObjectFields({
  id,
  properties,
  value,
  onChange,
  variables,
  context,
  path,
  problems,
  sectioned = false,
}: {
  id: string;
  properties: Record<string, Property>;
  value: unknown;
  onChange(patch: Record<string, unknown>): void;
  variables?: VariableOption[];
  context?: FieldContext;
  path?: string;
  problems?: FieldProblems;
  /**
   * Lays the fields out by their schema hints: named groups under a caption and `advanced` ones
   * behind a folded summary. Off, every field follows the last in schema order.
   */
  sectioned?: boolean;
}) {
  const record = isRecord(value) ? value : {};
  /* An object that declares a table reference is the scope its column pickers read, and one that
   * picks a column is the scope its operator field reads. What the object does not declare it
   * inherits, so a filter row nested in an array still sees the table its node selected. */
  const named = (want: (property: Property) => boolean | undefined) => {
    const key = Object.entries(properties).find(([, property]) => want(property))?.[0];
    if (key === undefined) return undefined;
    return typeof record[key] === "string" ? record[key] : "";
  };
  const tableId = named((property) => property.tableRef);
  const columnId = named((property) => property.columnRef);
  const scope: FieldContext | undefined =
    tableId === undefined && columnId === undefined
      ? context
      : { tableId: tableId ?? context?.tableId, columnId: columnId ?? context?.columnId };
  const shown = (names: readonly string[]) =>
    names.filter((name) => isVisible(properties[name]!, record));
  const render = (name: string) => (
    <ConfigField
      key={name}
      id={`${id}-${name}`}
      name={name}
      property={properties[name]!}
      value={record[name]}
      onChange={(next) => onChange({ [name]: next })}
      variables={variables}
      context={scope}
      path={path === undefined ? undefined : `${path}.${name}`}
      problems={problems}
    />
  );

  if (!sectioned) return <>{shown(Object.keys(properties)).map(render)}</>;
  return (
    <>
      {sectionFields(properties).map((section) => {
        const names = shown(section.names);
        if (names.length === 0) return null;
        if (section.kind === "main") return names.map(render);
        if (section.kind === "group")
          return (
            <section key={section.label} className={styles.section}>
              <h3 className={styles.sectionTitle}>{section.label}</h3>
              {names.map(render)}
            </section>
          );
        return (
          <details key="advanced" className={styles.advanced}>
            <summary className={styles.summary}>
              Advanced
              <span className={styles.summaryCount}>
                {names.length === 1 ? "1 setting" : `${names.length} settings`}
              </span>
            </summary>
            <div className={styles.sectionBody}>{names.map(render)}</div>
          </details>
        );
      })}
    </>
  );
}

/**
 * A list of objects, one row each. The row's controls sit at its end and show while it is hovered
 * or holds focus, so a list of ten filters reads as ten lines rather than ten boxed toolbars.
 */
export function ArrayField({
  id,
  label,
  property,
  value,
  onChange,
  variables,
  context,
  path,
  problems,
}: Omit<FieldProps, "name"> & { label: string }) {
  const items = Array.isArray(value) ? value : [];
  const itemSchema = property.items as TSchema;
  const noun = singular(label);
  const replace = (index: number, item: unknown) =>
    onChange(items.map((current, i) => (i === index ? item : current)));
  const move = (from: number, to: number) => {
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  return (
    <div className={styles.list}>
      <div>
        <span className="text-label">{label}</span>
        {property.description && (
          <p className="schema-help text-xs text-muted-foreground">{property.description}</p>
        )}
      </div>
      {items.map((item, index) => (
        <div
          key={index}
          role="group"
          aria-label={itemTitle(item, index, noun)}
          className={styles.row}
        >
          <div className={styles.rowHead}>
            <span className={styles.rowTitle}>{itemTitle(item, index, noun)}</span>
            <div className={styles.rowActions}>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Move ${noun} ${index + 1} up`}
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
              >
                <RiArrowUpLine aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Move ${noun} ${index + 1} down`}
                disabled={index === items.length - 1}
                onClick={() => move(index, index + 1)}
              >
                <RiArrowDownLine aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${noun} ${index + 1}`}
                onClick={() => onChange(items.filter((_, i) => i !== index))}
              >
                <RiDeleteBinLine aria-hidden="true" />
              </Button>
            </div>
          </div>
          <div className={styles.rowFields}>
            <ObjectFields
              id={`${id}-${index}`}
              properties={property.items!.properties!}
              value={item}
              onChange={(patch) => replace(index, { ...(isRecord(item) ? item : {}), ...patch })}
              variables={variables}
              context={context}
              path={path === undefined ? undefined : `${path}.${index}`}
              problems={problems}
            />
          </div>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => onChange([...items, Value.Create(itemSchema)])}
      >
        <RiAddLine aria-hidden="true" />
        Add {noun.toLowerCase()}
      </Button>
    </div>
  );
}
