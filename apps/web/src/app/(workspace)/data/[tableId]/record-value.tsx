import type { DataColumn, DataRecord, DataTable } from "@automator/contracts";
import type { ReactNode } from "react";
import { LocalTime } from "../../runs/local-time";

function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function blank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

/** One value as the grid shows it: readable, and never wider than the column it sits in. */
export function RecordValue({ column, value }: { column: DataColumn; value: unknown }): ReactNode {
  if (column.type === "checkbox") return value === true ? "Yes" : "No";
  if (blank(value)) return <span className="text-muted-foreground">—</span>;
  if (column.type === "datetime" && typeof value === "string")
    return Number.isNaN(Date.parse(value)) ? value : <LocalTime value={value} zone={false} />;
  if (column.type === "address" && typeof value === "string")
    return (
      <code className="text-code" title={value}>
        {shortAddress(value)}
      </code>
    );
  if (column.type === "number") return <span className="tabular-nums">{String(value)}</span>;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (
    <span className="block max-w-[40ch] truncate" title={text}>
      {text}
    </span>
  );
}

/** What to call a record in a heading or a confirmation: its first value that reads as a name. */
export function recordLabel(table: DataTable, record: DataRecord): string {
  for (const column of table.columns) {
    const value = record.values[column.id];
    if (typeof value === "string" && value.trim() !== "") return value;
    if (typeof value === "number") return String(value);
  }
  return record.id;
}
