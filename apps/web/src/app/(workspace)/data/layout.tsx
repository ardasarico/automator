import type { ReactNode } from "react";
import { DATA_RAIL_COOKIE } from "../../../lib/preferences";
import { readPreferenceCookie } from "../../../lib/preferences.server";
import styles from "./data.module.css";
import { loadTables } from "./load-tables";
import { TableRail } from "./table-rail";

/**
 * The section's tables, the records of the one that is open, and the open record, side by side.
 * `panel` is a parallel route, so `/data/<table>/<record>` carries all three in one URL: the
 * panel can be linked and Back closes it. At `/data` and `/data/<table>` its default renders
 * nothing and the content takes the pane.
 */
export default async function DataLayout({
  children,
  panel,
}: {
  children: ReactNode;
  panel: ReactNode;
}) {
  const [tables, rail] = await Promise.all([loadTables(), readPreferenceCookie(DATA_RAIL_COOKIE)]);
  return (
    <div className={styles.split}>
      <TableRail tables={tables} defaultState={rail === "collapsed" ? "collapsed" : "open"} />
      <div className={styles.main}>{children}</div>
      {panel}
    </div>
  );
}
