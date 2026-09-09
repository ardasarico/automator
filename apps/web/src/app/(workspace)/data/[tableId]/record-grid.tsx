"use client";

import type { DataColumn, DataRecord, DataTable } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@automator/ui/menu";
import { RiAddLine, RiArrowDownSLine, RiExpandDiagonalLine } from "@remixicon/react";
import Link from "next/link";
import styles from "../data.module.css";
import { ColumnTypeIcon } from "../column-types";
import { recordHref, type RecordQuery } from "./record-query";
import { RecordCell } from "./record-cell";

/**
 * The table's records. Cells are edited where they sit; the gutter's expand control opens the
 * whole record in the panel, which is where a wide table becomes readable. A column's header
 * carries its type and the controls that sort or filter by it, so the toolbar stays short.
 */
export function RecordGrid({
  table,
  records,
  query,
  onSaved,
  onFilter,
  onSort,
}: {
  table: DataTable;
  records: readonly DataRecord[];
  query: RecordQuery;
  onSaved: (record: DataRecord) => void;
  onFilter: (column: DataColumn) => void;
  onSort: (column: DataColumn, direction: "asc" | "desc") => void;
}) {
  const sorted = query.sort;
  return (
    <div className={styles.gridWrap}>
      <table className={styles.grid}>
        <caption className="sr-only">
          Records in {table.name}
          {sorted ? `, sorted by ${sorted.column}` : ", newest first"}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={styles.gutter}>
              <span className="sr-only">Row</span>
            </th>
            {table.columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                /* The header's own name: screen readers announce cells by it, not by the
                 * control inside, which says what it does rather than what the column is. */
                aria-label={column.name}
                aria-sort={
                  sorted?.column === column.id
                    ? sorted.direction === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
              >
                <Menu>
                  <MenuTrigger
                    render={
                      <button
                        type="button"
                        className={styles.columnHead}
                        aria-label={`Column ${column.name}`}
                      />
                    }
                  >
                    <ColumnTypeIcon type={column.type} />
                    <span className={styles.columnName}>{column.name}</span>
                    <RiArrowDownSLine aria-hidden="true" className={styles.columnChevron} />
                  </MenuTrigger>
                  <MenuPopup align="start">
                    <MenuItem onClick={() => onSort(column, "asc")}>Sort ascending</MenuItem>
                    <MenuItem onClick={() => onSort(column, "desc")}>Sort descending</MenuItem>
                    <MenuItem onClick={() => onFilter(column)}>Filter by this column…</MenuItem>
                  </MenuPopup>
                </Menu>
              </th>
            ))}
            <th scope="col" className={styles.rowEnd}>
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {records.map((record, index) => (
            <tr key={record.id}>
              <td className={styles.gutter}>{index + 1}</td>
              {table.columns.map((column, position) =>
                position === 0 ? (
                  <th key={column.id} scope="row" className={styles.firstCell}>
                    <RecordCell table={table} record={record} column={column} onSaved={onSaved} />
                  </th>
                ) : (
                  <td key={column.id}>
                    <RecordCell table={table} record={record} column={column} onSaved={onSaved} />
                  </td>
                ),
              )}
              <td className={styles.rowEnd}>
                <Link
                  href={recordHref(table.id, record.id, query)}
                  scroll={false}
                  className={styles.expand}
                  aria-label={`Open record ${index + 1}`}
                >
                  <RiExpandDiagonalLine aria-hidden="true" />
                </Link>
              </td>
            </tr>
          ))}
          <tr>
            <td colSpan={table.columns.length + 2} className={styles.newRow}>
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
