"use client";

import { dataColumnOperators, type ConditionOperator, type DataColumn } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@automator/ui/dialog";
import { Field, FieldLabel } from "@automator/ui/field";
import { Input } from "@automator/ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@automator/ui/select";
import { useState } from "react";
import { humanize } from "../../../../components/schema-form";
import type { RecordFilter } from "./record-query";

/** These two ask about the column itself, so there is nothing to type. */
function needsValue(operator: ConditionOperator): boolean {
  return operator !== "is_empty" && operator !== "is_not_empty";
}

/**
 * One filter on one column, opened from that column's own header. Only the operators the column's
 * type supports are offered — the same list the API validates against, so the grid cannot ask a
 * question the store will refuse.
 */
export function RecordFilterDialog({
  column,
  current,
  onClose,
  onApply,
}: {
  column: DataColumn;
  current?: RecordFilter;
  onClose(): void;
  onApply(filter: RecordFilter): void;
}) {
  const operators = dataColumnOperators[column.type] ?? [];
  const [operator, setOperator] = useState<ConditionOperator>(
    current?.operator ?? operators[0] ?? "equals",
  );
  const [value, setValue] = useState(current?.value ?? "");
  const options = column.type === "select" ? (column.options ?? []) : undefined;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>Filter by {column.name}</DialogTitle>
          <DialogDescription>
            Only the records this matches stay in the grid. Filtering shows one page of matches
            rather than paging through the whole table.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 px-6">
          <Field>
            <FieldLabel htmlFor="filter-operator">Condition</FieldLabel>
            <Select
              items={operators.map((option) => ({ value: option, label: humanize(option) }))}
              value={operator}
              onValueChange={(next) => setOperator(next as ConditionOperator)}
            >
              <SelectTrigger id="filter-operator" size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {operators.map((option) => (
                  <SelectItem key={option} value={option}>
                    {humanize(option)}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>
          {needsValue(operator) &&
            (options ? (
              <Field>
                <FieldLabel htmlFor="filter-value">Value</FieldLabel>
                <Select
                  items={options.map((option) => ({ value: option, label: option }))}
                  value={value}
                  onValueChange={(next) => setValue(next ?? "")}
                >
                  <SelectTrigger id="filter-value" size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor="filter-value">Value</FieldLabel>
                <Input
                  id="filter-value"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder={column.type === "number" ? "0" : ""}
                />
              </Field>
            ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onApply({
                column: column.id,
                operator,
                value: needsValue(operator) ? value.trim() : "",
              })
            }
          >
            Apply filter
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
