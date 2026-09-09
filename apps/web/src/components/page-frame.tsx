import { RiArrowRightSLine } from "@remixicon/react";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./page-frame.module.css";

type Breadcrumb = { label: string; href: string };

/**
 * One continuous surface for a workspace page: the heading and its primary action on the
 * title bar, filters and view controls on the toolbar, and the page's own content scrolling
 * underneath. Pages that need the viewport (a canvas, a split view) do not use it.
 */
export function PageFrame({
  title,
  parents,
  actions,
  banner,
  toolbar,
  children,
}: {
  title: ReactNode;
  /** Where a detail page sits: its section, ahead of the title on the same line. */
  parents?: readonly Breadcrumb[];
  actions?: ReactNode;
  /** A summary of what the page holds, above the controls that filter it. */
  banner?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.frame}>
      <div className={styles.titleBar}>
        {parents && parents.length > 0 && (
          <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
            <ol>
              {parents.map(({ label, href }) => (
                <li key={href}>
                  <Link href={href}>{label}</Link>
                  <RiArrowRightSLine aria-hidden="true" />
                </li>
              ))}
            </ol>
          </nav>
        )}
        <h1 className={styles.title}>{title}</h1>
        {actions && <div className={styles.titleActions}>{actions}</div>}
      </div>
      {banner && <div className={styles.banner}>{banner}</div>}
      {toolbar && <div className={styles.toolbar}>{toolbar}</div>}
      <div className={styles.content}>{children}</div>
    </div>
  );
}
