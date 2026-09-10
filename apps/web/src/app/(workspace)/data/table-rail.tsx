"use client";

import type { DataTable } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { Menu, MenuLinkItem, MenuPopup, MenuTrigger } from "@automator/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@automator/ui/tooltip";
import { RiAddLine, RiSideBarLine, RiTableLine } from "@remixicon/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { DATA_RAIL_COOKIE, setPreferenceCookie } from "../../../lib/preferences";
import styles from "./data.module.css";
import { TableDialog } from "./table-dialog";

export type RailState = "open" | "collapsed";

/** The table the URL has open: `/data/<table>` and `/data/<table>/<record>` both count. */
function openTableId(pathname: string): string | undefined {
  const [, section, tableId] = pathname.split("/");
  return section === "data" && tableId ? decodeURIComponent(tableId) : undefined;
}

function tableHref(table: DataTable): string {
  return `/data/${encodeURIComponent(table.id)}`;
}

/**
 * The section's own navigation: every table, beside the records of the one that is open.
 * Collapsing gives the width back without taking the navigation away — the list becomes a menu
 * behind one control, the same trade the workspace sidebar makes when it drops to its icon rail.
 */
export function TableRail({
  tables,
  defaultState,
}: {
  tables: readonly DataTable[];
  defaultState: RailState;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<RailState>(defaultState);
  const [creating, setCreating] = useState(false);
  const activeId = openTableId(pathname);
  const collapsed = state === "collapsed";

  function toggle() {
    const next: RailState = collapsed ? "open" : "collapsed";
    setState(next);
    setPreferenceCookie(DATA_RAIL_COOKIE, next);
  }

  const dialog = creating && (
    <TableDialog
      onClose={() => setCreating(false)}
      onSaved={(saved) => {
        setCreating(false);
        /* The rail is the layout's, and a push between the layout's own children does not
         * re-run the layout, so the new table would reach the pane and not the rail. The
         * refresh has to follow the push: called first, the navigation supersedes it and the
         * rail stays stale. */
        router.push(`/data/${encodeURIComponent(saved.id)}`);
        router.refresh();
      }}
    />
  );

  return (
    <div className={`${styles.rail} ${collapsed ? styles.railCollapsed : ""}`}>
      <div className={styles.railHead}>
        {!collapsed && <span className={styles.railLabel}>Tables</span>}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={collapsed ? "Show the table list" : "Hide the table list"}
                aria-expanded={!collapsed}
                onClick={toggle}
              />
            }
          >
            <RiSideBarLine aria-hidden="true" />
          </TooltipTrigger>
          <TooltipPopup>{collapsed ? "Show tables" : "Hide tables"}</TooltipPopup>
        </Tooltip>
      </div>

      {collapsed ? (
        <div className={styles.railStrip}>
          <Menu>
            <MenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="Choose a table" />}
            >
              <RiTableLine aria-hidden="true" />
            </MenuTrigger>
            <MenuPopup align="start">
              {tables.map((table) => (
                <MenuLinkItem key={table.id} href={tableHref(table)}>
                  {table.name}
                </MenuLinkItem>
              ))}
            </MenuPopup>
          </Menu>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="New table"
                  onClick={() => setCreating(true)}
                />
              }
            >
              <RiAddLine aria-hidden="true" />
            </TooltipTrigger>
            <TooltipPopup>New table</TooltipPopup>
          </Tooltip>
        </div>
      ) : (
        <>
          <nav aria-label="Tables" className={styles.railList}>
            {tables.map((table) => (
              <Link
                key={table.id}
                href={tableHref(table)}
                aria-current={table.id === activeId ? "page" : undefined}
                className={styles.railRow}
              >
                <RiTableLine aria-hidden="true" />
                <span className={styles.railName}>{table.name}</span>
                <span className={styles.railCount}>{table.recordCount}</span>
              </Link>
            ))}
          </nav>
          <div className={styles.railFoot}>
            <button type="button" className={styles.railNew} onClick={() => setCreating(true)}>
              <RiAddLine aria-hidden="true" />
              New table
            </button>
          </div>
        </>
      )}
      {dialog}
    </div>
  );
}
