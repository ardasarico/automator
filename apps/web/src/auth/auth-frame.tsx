import { Logo } from "@automator/ui/logo";
import type { ReactNode } from "react";
import { AuthBackground } from "./auth-background";
import { ThemeToggle } from "./theme-toggle";
import styles from "./auth.module.css";

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <AuthBackground />
      <div className={styles.backgroundBlur} aria-hidden="true" />
      <header className={styles.header}>
        <Logo markColor="var(--brand)" />
        <ThemeToggle />
      </header>
      <main className={styles.main}>
        <div className={styles.form}>{children}</div>
      </main>
    </div>
  );
}
