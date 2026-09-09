import styles from "./skeleton.module.css";

/**
 * A block standing in for content that has not arrived. It says nothing on its own — the
 * skeleton around it is hidden from assistive technology and the page announces the wait in
 * words — so it carries only the size the caller gives it.
 */
export function Skeleton({ className }: { className?: string }) {
  return <span className={className ? `${styles.pulse} ${className}` : styles.pulse} />;
}
