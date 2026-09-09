"use client";

import { Button } from "@automator/ui/button";
import { RiCloseLine } from "@remixicon/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import styles from "./side-panel.module.css";

/**
 * One row of a list, opened beside it. The panel is not modal: the list underneath stays
 * readable and clickable, so moving between rows is one click. Escape closes it, and closing
 * is a navigation — the URL says which row is open, so the panel can be linked and the back
 * button behaves.
 */
export function SidePanel({
  title,
  subtitle,
  closeHref,
  label,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  closeHref: string;
  label: string;
  children: ReactNode;
}) {
  const router = useRouter();
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      /* Let a popup, dialog or menu take its own Escape first. */
      if (event.key !== "Escape" || event.defaultPrevented) return;
      router.push(closeHref, { scroll: false });
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [router, closeHref]);
  return (
    <aside aria-label={label} className={styles.panel}>
      <header className={styles.header}>
        <div className={styles.titles}>
          <h2 className={styles.title}>{title}</h2>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close panel"
          render={<Link href={closeHref} scroll={false} />}
        >
          <RiCloseLine aria-hidden="true" />
        </Button>
      </header>
      <div className={styles.body}>{children}</div>
    </aside>
  );
}
