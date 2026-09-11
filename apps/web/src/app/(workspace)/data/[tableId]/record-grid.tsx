"use client";

import type { DataColumn, DataColumnType, DataRecord, DataTable } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { Checkbox } from "@automator/ui/checkbox";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@automator/ui/menu";
import {
  RiAddLine,
  RiArrowDownSLine,
  RiArrowUpSLine,
  RiCheckLine,
  RiExpandDiagonalLine,
} from "@remixicon/react";
import Link from "next/link";
import { useState, type PointerEvent as ReactPointerEvent } from "react";
import tableStyles from "../../../../components/workspace-table.module.css";
import { ColumnTypeIcon } from "../column-types";
import styles from "../data.module.css";
import { maxColumnWidth, minColumnWidth } from "./column-preferences";
import { recordHref, type RecordQuery } from "./record-query";
import { RecordCell } from "./record-cell";

/** What ascending means depends on what the column holds, so the menu says it in those words. */
const sortWords: Record<DataColumnType, { asc: string; desc: string }> = {
  text: { asc: "A → Z", desc: "Z → A" },
  number: { asc: "Low to high", desc: "High to low" },
  checkbox: { asc: "Unchecked first", desc: "Checked first" },
  datetime: { asc: "Oldest first", desc: "Newest first" },
  select: { asc: "A → Z", desc: "Z → A" },
  address: { asc: "A → Z", desc: "Z → A" },
};

/** A column with no width of its own: wide enough for what its type usually holds. */
const defaultWidths: Record<DataColumnType, number> = {
  text: 220,
  number: 120,
  checkbox: 96,
  datetime: 176,
  select: 152,
  address: 168,
};

/*
 * ...and never so narrow that the column's own name has to truncate in the heading. The name is
 * measured in characters rather than pixels — close enough at this size, and it costs no layout
 * pass — allowing for the type icon, the caret and the cell's padding.
 */
const headingRoom = 76;
const characterWidth = 8;
const widestDefault = 320;

export interface ColumnActions {
  onSort(column: DataColumn, direction: "asc" | "desc"): void;
  onClearSort(): void;
  onFilter(column: DataColumn): void;
  onHide(column: DataColumn): void;
  onRename(column: DataColumn): void;
  onDelete(column: DataColumn): void;
  onAdd(): void;
  onResize(column: DataColumn, width: number): void;
}

export interface RecordSelection {
  selected: ReadonlySet<string>;
  onToggle(recordId: string, selected: boolean): void;
  onToggleAll(selected: boolean): void;
}

function widthOf(column: DataColumn, widths: Readonly<Record<string, number>>): number {
  const stored = widths[column.id];
  if (stored !== undefined) return stored;
  return Math.min(
    widestDefault,
    Math.max(defaultWidths[column.type], headingRoom + column.name.length * characterWidth),
  );
}

/**
 * One column's heading: its type, its name, the order and filter that act on it, and the two
 * things only this viewer decides — whether the column is shown, and how wide. The heading says
 * when it is the sorted or filtered one, so the state is visible in the grid and not only in a
 * chip above it.
 */
function ColumnHeading({
  column,
  width,
  sorted,
  filtered,
  last,
  first,
  hideable,
  deletable,
  actions,
  onDragWidth,
}: {
  column: DataColumn;
  width: number;
  sorted?: "asc" | "desc";
  filtered: boolean;
  last: boolean;
  /** The heading of the column that holds still while the grid scrolls sideways. */
  first: boolean;
  /** A grid with one column left has nothing to show once it is hidden or deleted. */
  hideable: boolean;
  deletable: boolean;
  actions: ColumnActions;
  onDragWidth(column: DataColumn, event: ReactPointerEvent<HTMLElement>): void;
}) {
  const words = sortWords[column.type];
  return (
    <th
      scope="col"
      /* The heading's own name: screen readers announce the cells under it by this, not by the
       * control inside, which says what it does rather than what the column is. */
      aria-label={column.name}
      aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : undefined}
      className={
        first ? `${styles.columnCell} ${styles.sticky} ${styles.firstCell}` : styles.columnCell
      }
      style={{ width }}
    >
      <Menu>
        <MenuTrigger
          className={tableStyles.columnTrigger}
          data-active={sorted ? "" : undefined}
          data-filtered={filtered ? "" : undefined}
          aria-label={`${column.name} column options`}
        >
          <ColumnTypeIcon type={column.type} />
          <span className={styles.columnName}>{column.name}</span>
          {sorted === "asc" ? (
            <RiArrowUpSLine aria-hidden="true" className={tableStyles.columnMark} />
          ) : sorted === "desc" ? (
            <RiArrowDownSLine aria-hidden="true" className={tableStyles.columnMark} />
          ) : (
            <RiArrowDownSLine aria-hidden="true" className={tableStyles.columnCaret} />
          )}
        </MenuTrigger>
        <MenuPopup align="start">
          <Choice checked={sorted === "asc"} onClick={() => actions.onSort(column, "asc")}>
            {words.asc}
          </Choice>
          <Choice checked={sorted === "desc"} onClick={() => actions.onSort(column, "desc")}>
            {words.desc}
          </Choice>
          {sorted && <MenuItem onClick={actions.onClearSort}>Clear the order</MenuItem>}
          <MenuSeparator />
          <MenuItem onClick={() => actions.onFilter(column)}>
            {filtered ? "Change this filter…" : "Filter by this column…"}
          </MenuItem>
          <MenuSeparator />
          <MenuItem onClick={() => actions.onRename(column)}>Rename column…</MenuItem>
          {hideable && <MenuItem onClick={() => actions.onHide(column)}>Hide column</MenuItem>}
          {deletable && (
            <MenuItem variant="destructive" onClick={() => actions.onDelete(column)}>
              Delete column…
            </MenuItem>
          )}
        </MenuPopup>
      </Menu>
      {/* The last column is followed by the slack the trailing column takes, so widening it
       * there would push against nothing. */}
      {!last && (
        <span
          role="separator"
          aria-label={`${column.name} column width`}
          aria-orientation="vertical"
          aria-valuenow={width}
          aria-valuemin={minColumnWidth}
          aria-valuemax={maxColumnWidth}
          tabIndex={0}
          className={styles.resizer}
          onPointerDown={(event) => onDragWidth(column, event)}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 48 : 16;
            if (event.key === "ArrowLeft") actions.onResize(column, width - step);
            else if (event.key === "ArrowRight") actions.onResize(column, width + step);
            else return;
            event.preventDefault();
          }}
        />
      )}
    </th>
  );
}

/** A menu choice that says whether it is the one in effect. */
function Choice({
  checked,
  onClick,
  children,
}: {
  checked: boolean;
  onClick(): void;
  children: string;
}) {
  return (
    <MenuItem
      className={tableStyles.choiceItem}
      data-checked={checked ? "" : undefined}
      onClick={onClick}
    >
      <RiCheckLine aria-hidden="true" className={tableStyles.choiceMark} />
      <span>{children}</span>
    </MenuItem>
  );
}

/**
 * The table's records. Cells are edited where they sit; the control in the name cell opens the
 * whole record in the panel, which is where a wide table becomes readable. The row number turns
 * into a checkbox when the row is wanted, so selection costs the grid no width.
 */
export function RecordGrid({
  table,
  columns,
  records,
  query,
  widths,
  selection,
  actions,
  openRecordId,
  onSaved,
}: {
  table: DataTable;
  /** The columns this viewer has kept, in the table's own order. */
  columns: readonly DataColumn[];
  records: readonly DataRecord[];
  query: RecordQuery;
  widths: Readonly<Record<string, number>>;
  selection: RecordSelection;
  actions: ColumnActions;
  openRecordId?: string;
  onSaved: (record: DataRecord) => void;
}) {
  /* A width is committed once, when the drag ends: the preference is stored, and a store write
   * per pointer move would be the one thing in this grid that touches disk sixty times a second. */
  const [dragging, setDragging] = useState<{ id: string; width: number } | null>(null);
  const sorted = query.sort;
  const selectedHere = records.filter((record) => selection.selected.has(record.id)).length;

  function width(column: DataColumn): number {
    return dragging?.id === column.id ? dragging.width : widthOf(column, widths);
  }

  function startDrag(column: DataColumn, event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const from = event.clientX;
    const start = widthOf(column, widths);
    const next = (clientX: number) =>
      Math.round(Math.min(maxColumnWidth, Math.max(minColumnWidth, start + clientX - from)));
    const move = (moved: PointerEvent) =>
      setDragging({ id: column.id, width: next(moved.clientX) });
    const stop = (ended: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      setDragging(null);
      actions.onResize(column, next(ended.clientX));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  return (
    <div className={styles.gridWrap}>
      <table className={`${styles.grid} ${dragging ? styles.resizing : ""}`}>
        <caption className="sr-only">
          Records in {table.name}
          {sorted ? `, sorted by ${sorted.column}` : ", newest first"}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={`${styles.gutter} ${styles.sticky}`}>
              <Checkbox
                aria-label={
                  selectedHere === records.length
                    ? "Clear the selection"
                    : "Select every record shown"
                }
                checked={selectedHere === records.length && records.length > 0}
                indeterminate={selectedHere > 0 && selectedHere < records.length}
                onCheckedChange={(next) => selection.onToggleAll(next)}
              />
            </th>
            {columns.map((column, position) => (
              <ColumnHeading
                key={column.id}
                column={column}
                width={width(column)}
                sorted={sorted?.column === column.id ? sorted.direction : undefined}
                filtered={query.filters.some((filter) => filter.column === column.id)}
                last={position === columns.length - 1}
                first={position === 0}
                hideable={columns.length > 1}
                deletable={table.columns.length > 1}
                actions={actions}
                onDragWidth={startDrag}
              />
            ))}
            <th scope="col" className={styles.addColumn}>
              <button
                type="button"
                className={styles.addColumnButton}
                aria-label="Add a column"
                onClick={actions.onAdd}
              >
                <RiAddLine aria-hidden="true" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody className={styles.rows}>
          {records.map((record, index) => {
            const checked = selection.selected.has(record.id);
            return (
              <tr
                key={record.id}
                aria-current={record.id === openRecordId ? "true" : undefined}
                data-selected={checked ? "" : undefined}
              >
                <td className={`${styles.gutter} ${styles.sticky}`}>
                  <span className={styles.gutterCell}>
                    <span className={styles.rowNumber} aria-hidden="true">
                      {index + 1}
                    </span>
                    <Checkbox
                      className={styles.rowCheck}
                      aria-label={`Select record ${index + 1}`}
                      checked={checked}
                      onCheckedChange={(next) => selection.onToggle(record.id, next)}
                    />
                  </span>
                </td>
                {columns.map((column, position) =>
                  position === 0 ? (
                    <th
                      key={column.id}
                      scope="row"
                      className={`${styles.sticky} ${styles.firstCell}`}
                    >
                      <span className={styles.nameCell}>
                        <span className={styles.nameValue}>
                          <RecordCell
                            table={table}
                            record={record}
                            column={column}
                            onSaved={onSaved}
                          />
                        </span>
                        <Link
                          href={recordHref(table.id, record.id, query)}
                          scroll={false}
                          className={styles.expand}
                          aria-label={`Open record ${index + 1}`}
                        >
                          <RiExpandDiagonalLine aria-hidden="true" />
                        </Link>
                      </span>
                    </th>
                  ) : (
                    <td key={column.id}>
                      <RecordCell table={table} record={record} column={column} onSaved={onSaved} />
                    </td>
                  ),
                )}
                <td aria-hidden="true" />
              </tr>
            );
          })}
          <tr className={styles.newRow}>
            <td colSpan={columns.length + 2}>
              <Button
                variant="ghost"
                size="sm"
                render={<Link href={recordHref(table.id, "new", query)} scroll={false} />}
              >
                <RiAddLine aria-hidden="true" />
                New record
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
