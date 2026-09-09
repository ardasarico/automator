import type { DataColumnType } from "@automator/contracts";
import {
  RiCalendarLine,
  RiCheckboxLine,
  RiHashtag,
  RiListCheck2,
  RiText,
  RiWallet3Line,
  type RemixiconComponentType,
} from "@remixicon/react";

/**
 * A column's type, shown rather than spelled out. The gallery, the grid's headers and the record
 * panel all read from here, so a column looks the same wherever it appears.
 */
const icons: Record<DataColumnType, RemixiconComponentType> = {
  text: RiText,
  number: RiHashtag,
  checkbox: RiCheckboxLine,
  datetime: RiCalendarLine,
  select: RiListCheck2,
  address: RiWallet3Line,
};

const labels: Record<DataColumnType, string> = {
  text: "text",
  number: "number",
  checkbox: "checkbox",
  datetime: "date",
  select: "choice",
  address: "address",
};

export function ColumnTypeIcon({ type, ...props }: { type: DataColumnType; className?: string }) {
  const Icon = icons[type] ?? RiText;
  return <Icon aria-hidden="true" {...props} />;
}

export function columnTypeLabel(type: DataColumnType): string {
  return labels[type] ?? type;
}
