import { EmptyStateIllustration } from "@automator/ui/empty-state-illustration";
import type { ReactNode } from "react";
import styles from "./empty-state.module.css";

/**
 * The one shape for a page's empty, filtered-out and unavailable states: the illustration,
 * a heading, one sentence, one action. `children` is for the first-run hero, which carries
 * its start options under the sentence; nothing else should need it.
 */
export function EmptyState({
  icon,
  title,
  titleId,
  text,
  action,
  children,
  variant,
  heading: Heading = "h2",
  status = false,
  className,
}: {
  icon: ReactNode;
  title: ReactNode;
  /** Set to name the surrounding `section` by its heading. */
  titleId?: string;
  text: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  /** `hero` for a section's first-run state, `fill` for a panel that owns its region. */
  variant?: "hero" | "fill";
  /** `h3` when the state sits inside a section that already has its own `h2`. */
  heading?: "h2" | "h3";
  /** Announce the heading: an unavailable state is news, an empty list is not. */
  status?: boolean;
  className?: string;
}) {
  const Wrapper = titleId ? "section" : "div";
  return (
    <Wrapper
      className={[styles.empty, variant && styles[variant], className].filter(Boolean).join(" ")}
      aria-labelledby={titleId}
    >
      <EmptyStateIllustration icon={icon} />
      <Heading id={titleId} className={styles.title} role={status ? "status" : undefined}>
        {title}
      </Heading>
      <p className={styles.text}>{text}</p>
      {action && <div className={styles.action}>{action}</div>}
      {children}
    </Wrapper>
  );
}
