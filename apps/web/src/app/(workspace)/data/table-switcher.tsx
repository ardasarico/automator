"use client";

import type { DataTable } from "@automator/contracts";
import {
  Menu,
  MenuItem,
  MenuLinkItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@automator/ui/menu";
import { RiAddLine, RiCheckLine, RiExpandUpDownLine } from "@remixicon/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./data.module.css";
import { TableDialog } from "./table-dialog";

/**
 * The open table's name on the title bar, and the section's whole table list behind it. This is
 * what replaced the navigation rail: the switcher costs no width, and the breadcrumb beside it
 * keeps `/data` one click away, so the section reads as a hierarchy rather than a tab strip.
 */
export function TableSwitcher({
  tables,
  current,
}: {
  tables: readonly DataTable[];
  current: DataTable;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <Menu>
        <MenuTrigger className={styles.switcher} aria-label={`${current.name} — switch table`}>
          <span className={styles.switcherName}>{current.name}</span>
          <RiExpandUpDownLine aria-hidden="true" className={styles.switcherCaret} />
        </MenuTrigger>
        <MenuPopup align="start">
          {tables.map((table) => (
            <MenuLinkItem
              key={table.id}
              render={<Link href={`/data/${encodeURIComponent(table.id)}`} />}
              className={styles.switcherItem}
              data-checked={table.id === current.id ? "" : undefined}
              aria-current={table.id === current.id ? "page" : undefined}
            >
              <RiCheckLine aria-hidden="true" className={styles.switcherMark} />
              <span className={styles.switcherItemName}>{table.name}</span>
              <span className={styles.switcherItemCount}>{table.recordCount}</span>
            </MenuLinkItem>
          ))}
          <MenuSeparator />
          <MenuItem onClick={() => setCreating(true)}>
            <RiAddLine aria-hidden="true" />
            New table
          </MenuItem>
        </MenuPopup>
      </Menu>
      {creating && (
        <TableDialog
          onClose={() => setCreating(false)}
          onSaved={(saved) => {
            setCreating(false);
            router.push(`/data/${encodeURIComponent(saved.id)}`);
            /* The switcher's own list comes from the server, so the push has to be followed by
             * a refresh for the new table to appear in it. */
            router.refresh();
          }}
        />
      )}
    </>
  );
}
