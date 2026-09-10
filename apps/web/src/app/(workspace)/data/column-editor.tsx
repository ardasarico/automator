"use client";

import {
  dataColumnTypes,
  dataTableMaxColumns,
  type DataColumn,
  type DataColumnType,
} from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { Field, FieldDescription, FieldLabel } from "@automator/ui/field";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@automator/ui/select";
import { RiAddLine, RiArrowDownLine, RiArrowUpLine, RiDeleteBinLine } from "@remixicon/react";
import { ConfigField, Group, type Property } from "../../../components/schema-form";

const columnTypeLabels: Record<DataColumnType, string> = {
  text: "Text",
  number: "Number",
  checkbox: "Checkbox",
  datetime: "Date & time",
  select: "Single select",
  address: "Wallet address",
};

const nameProperty: Property = { type: "string" };
const requiredProperty: Property = {
  type: "boolean",
  description: "Every record must have a value here.",
};
const optionsProperty: Property = {
  type: "array",
  items: { type: "string" },
  description: "The values this column can take. Separate them with commas.",
};

const lockedTypeHint = "A column's type cannot change once the table has records.";

/**
 * One row of the editor: a column plus a key minted when the row is added. The key never derives
 * from the name or the id, so naming a column cannot remount its row and pull the caret out of the
 * name input mid-word. A new row carries no id: `TableDialog` mints it from the finished name.
 */
export type ColumnRow = DataColumn & { key: string };

let minted = 0;

/** A blank row, ready to be named. */
export function newColumnRow(): ColumnRow {
  minted += 1;
  return { key: `new-${minted}`, id: "", name: "", type: "text", required: false };
}

/** The rows a saved table edits as: a stored column keys on the id it already carries. */
export function toColumnRows(columns: readonly DataColumn[]): ColumnRow[] {
  return columns.map((column) => ({ ...column, key: `saved-${column.id}` }));
}

/**
 * The column list of a table. Columns that already hold records keep their type: `locked` names
 * them, and their type control is disabled rather than hidden so the type stays readable.
 */
export function ColumnEditor({
  id,
  columns,
  locked,
  disabled = false,
  onChange,
}: {
  id: string;
  columns: readonly ColumnRow[];
  locked: ReadonlySet<string>;
  disabled?: boolean;
  onChange(next: ColumnRow[]): void;
}) {
  const full = columns.length >= dataTableMaxColumns;
  const replace = (index: number, column: ColumnRow) =>
    onChange(columns.map((current, position) => (position === index ? column : current)));
  const move = (from: number, to: number) => {
    const next = [...columns];
    const [column] = next.splice(from, 1);
    next.splice(to, 0, column!);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <div>
        <span className="text-label">Columns</span>
        <p className="text-xs text-muted-foreground">
          Each column has a type that decides how its values are entered and checked.
        </p>
      </div>
      {columns.map((column, index) => {
        const fieldId = `${id}-${index}`;
        const typeLocked = column.id !== "" && locked.has(column.id);
        return (
          <Group
            key={column.key}
            label={column.name.trim() === "" ? `Column ${index + 1}` : column.name}
            actions={
              <>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Move column ${index + 1} up`}
                  disabled={disabled || index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  <RiArrowUpLine aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Move column ${index + 1} down`}
                  disabled={disabled || index === columns.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  <RiArrowDownLine aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove column ${index + 1}`}
                  disabled={disabled}
                  onClick={() => onChange(columns.filter((_, position) => position !== index))}
                >
                  <RiDeleteBinLine aria-hidden="true" />
                </Button>
              </>
            }
          >
            <ConfigField
              id={`${fieldId}-name`}
              name="name"
              property={nameProperty}
              value={column.name}
              onChange={(next) =>
                replace(index, { ...column, name: typeof next === "string" ? next : "" })
              }
            />
            <Field>
              <FieldLabel htmlFor={`${fieldId}-type`}>Type</FieldLabel>
              <Select
                disabled={disabled || typeLocked}
                items={dataColumnTypes.map((type) => ({
                  value: type,
                  label: columnTypeLabels[type],
                }))}
                value={column.type}
                onValueChange={(next) =>
                  replace(index, { ...column, type: next as DataColumnType })
                }
              >
                <SelectTrigger id={`${fieldId}-type`} size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {dataColumnTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {columnTypeLabels[type]}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              {typeLocked && <FieldDescription>{lockedTypeHint}</FieldDescription>}
            </Field>
            {column.type === "select" && (
              <ConfigField
                id={`${fieldId}-options`}
                name="options"
                property={optionsProperty}
                value={column.options ?? []}
                onChange={(next) =>
                  replace(index, {
                    ...column,
                    options: Array.isArray(next) ? (next as string[]) : [],
                  })
                }
              />
            )}
            <ConfigField
              id={`${fieldId}-required`}
              name="required"
              property={requiredProperty}
              value={column.required}
              onChange={(next) => replace(index, { ...column, required: next === true })}
            />
          </Group>
        );
      })}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        disabled={disabled || full}
        onClick={() => onChange([...columns, newColumnRow()])}
      >
        <RiAddLine aria-hidden="true" />
        Add column
      </Button>
      {full && (
        <p className="text-xs text-muted-foreground" role="status">
          A table can have at most {dataTableMaxColumns} columns. Remove one to add another.
        </p>
      )}
    </div>
  );
}
