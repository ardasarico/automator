import type { ReactNode } from "react";
import styles from "../../../components/panel-split.module.css";

/**
 * The list and the open run, side by side. `panel` is a parallel route: `/runs/<id>` renders
 * the list in `children` and the run in the slot, so one URL carries both, the panel can be
 * linked, and Back closes it. At `/runs` the slot's default renders nothing and the list
 * takes the whole pane.
 */
export default function RunsLayout({ children, panel }: { children: ReactNode; panel: ReactNode }) {
  return (
    <div className={styles.split}>
      <div className={styles.main}>{children}</div>
      {panel}
    </div>
  );
}
