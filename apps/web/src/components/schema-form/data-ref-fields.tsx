"use client";

import { dataColumnOperators } from "@automator/contracts";
import { Field, FieldDescription, FieldLabel } from "@automator/ui/field";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@automator/ui/select";
import Link from "next/link";
import { useDataTables } from "../../data/tables-context";
import { humanize, type FieldProps } from "./schema";

type RefFieldProps = Omit<FieldProps, "name" | "variables"> & { label: string };

type Option = { value: string; label: string };

/** One picker body: the same Select in every state, so a disabled or invalid field still reads. */
function RefSelect({
  id,
  label,
  options,
  value,
  placeholder,
  invalid,
  disabled,
  description,
  onChange,
}: {
  id: string;
  label: string;
  options: Option[];
  value: string;
  placeholder: string;
  invalid: boolean;
  disabled: boolean;
  description: React.ReactNode;
  onChange(value: unknown): void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        items={options}
        value={value === "" ? null : value}
        disabled={disabled}
        onValueChange={(next) => onChange(typeof next === "string" ? next : "")}
      >
        <SelectTrigger
          id={id}
          size="sm"
          className="w-full"
          aria-invalid={invalid ? true : undefined}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectPopup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
      {description && (
        <FieldDescription className={invalid ? "text-destructive-text" : undefined}>
          {description}
        </FieldDescription>
      )}
    </Field>
  );
}

/** Picks one of the account's tables. Stores the table id and shows its name. */
export function TableRefField({ id, label, property, value, onChange }: RefFieldProps) {
  const { tables, loading, error } = useDataTables();
  const selected = typeof value === "string" ? value.trim() : "";
  const options = tables.map((table) => ({ value: table.id, label: table.name }));
  // A table the account no longer has stays selected, so the panel names the same id the canvas
  // does. A failed load leaves the list empty without meaning the table is gone.
  const missing =
    selected !== "" && !loading && !error && !tables.some((table) => table.id === selected);
  if (missing) options.push({ value: selected, label: selected });

  return (
    <RefSelect
      id={id}
      label={label}
      options={options}
      value={selected}
      placeholder={loading ? "Loading tables…" : "Choose a table"}
      invalid={missing}
      disabled={loading || options.length === 0}
      description={
        missing ? (
          `Table “${selected}” is not one of your tables any more. Pick another one.`
        ) : error ? (
          error
        ) : options.length === 0 && !loading ? (
          <>
            You have no tables yet.{" "}
            <Link href="/data" className="underline">
              Create a table first
            </Link>
            .
          </>
        ) : (
          property.description
        )
      }
      onChange={onChange}
    />
  );
}

/** Picks a column of the table the surrounding config selected. Stores the column id. */
export function ColumnRefField({ id, label, property, value, onChange, context }: RefFieldProps) {
  const { tables, loading } = useDataTables();
  const tableId = context?.tableId?.trim() ?? "";
  const table = tables.find((candidate) => candidate.id === tableId);
  const selected = typeof value === "string" ? value.trim() : "";
  const options = (table?.columns ?? []).map((column) => ({
    value: column.id,
    label: column.name,
  }));
  const missingIn =
    table && selected !== "" && !table.columns.some((column) => column.id === selected)
      ? table.name
      : null;
  if (missingIn) options.push({ value: selected, label: selected });

  const hint = !tableId
    ? "Pick a table for this node first."
    : loading
      ? "Loading columns…"
      : !table
        ? "The selected table is not available, so its columns cannot be listed."
        : options.length === 0
          ? `“${table.name}” has no columns yet.`
          : null;

  return (
    <RefSelect
      id={id}
      label={label}
      options={options}
      value={selected}
      placeholder={hint ? "No columns" : "Choose a column"}
      invalid={missingIn !== null}
      disabled={hint !== null}
      description={
        missingIn
          ? `“${selected}” is not a column of “${missingIn}”. Pick another one.`
          : (hint ?? property.description)
      }
      onChange={onChange}
    />
  );
}

/**
 * Picks the operator of a filter row. A column type only supports some of them — the engine rejects
 * the rest — so the list narrows to what the picked column allows. Without a table or a column
 * there is nothing to narrow by and every operator stays offered; an operator the column cannot
 * take stays selected and reads as invalid, so a stored filter is never silently rewritten.
 */
export function OperatorField({
  id,
  label,
  property,
  options,
  value,
  onChange,
  context,
}: RefFieldProps & { options: string[] }) {
  const { tables } = useDataTables();
  const table = tables.find((candidate) => candidate.id === (context?.tableId?.trim() ?? ""));
  const column = table?.columns.find(
    (candidate) => candidate.id === (context?.columnId?.trim() ?? ""),
  );
  const allowed: readonly string[] | undefined = column && dataColumnOperators[column.type];
  const selected = typeof value === "string" && value !== "" ? value : (options[0] ?? "");
  const offered = allowed ? options.filter((option) => allowed.includes(option)) : [...options];
  const rejected =
    column && !offered.includes(selected)
      ? `“${column.name}” cannot be filtered with “${humanize(selected)}”. Pick another one.`
      : null;
  if (rejected) offered.push(selected);

  return (
    <RefSelect
      id={id}
      label={label}
      options={offered.map((option) => ({ value: option, label: humanize(option) }))}
      value={selected}
      placeholder="Choose an operator"
      invalid={rejected !== null}
      disabled={false}
      description={rejected ?? property.description}
      onChange={onChange}
    />
  );
}
