import type { ReactNode } from "react";
import styles from "../../../components/panel-split.module.css";

/**
 * The records of the table that is open and the record open beside them. `panel` is a parallel
 * route, so `/data/<table>/<record>` carries both in one URL: the panel can be linked and Back
 * closes it. At `/data` and `/data/<table>` its default renders nothing and the content takes
 * the pane. The section's own table list is the index at `/data` and the switcher on the title
 * bar — there is no second navigation rail.
 */
export default function DataLayout({ children, panel }: { children: ReactNode; panel: ReactNode }) {
  return (
    <div className={styles.split}>
      <div className={styles.main}>{children}</div>
      {panel}
    </div>
  );
}
