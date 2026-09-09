import type { ReactNode } from "react";
import styles from "./page-frame.module.css";

/**
 * One continuous surface for a workspace page: the heading and its primary action on the
 * title bar, filters and view controls on the toolbar, and the page's own content scrolling
 * underneath. Pages that need the viewport (a canvas, a split view) do not use it.
 */
export function PageFrame({
  title,
  actions,
  toolbar,
  children,
}: {
  title: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.frame}>
      <div className={styles.titleBar}>
        <h1 className={styles.title}>{title}</h1>
        {actions && <div className={styles.titleActions}>{actions}</div>}
      </div>
      {toolbar && <div className={styles.toolbar}>{toolbar}</div>}
      <div className={styles.content}>{children}</div>
    </div>
  );
}
