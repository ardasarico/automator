import styles from "./side-panel.module.css";
import { Skeleton } from "./skeleton";

const blocks = [0, 1, 2];

/**
 * The panel's frame while its row is being read: the same width and header, so the list
 * beside it moves over once rather than twice.
 */
export function SidePanelSkeleton({ label }: { label: string }) {
  return (
    <aside aria-label={label} aria-busy="true" className={styles.panel}>
      <header className={styles.header}>
        <div className={styles.titles}>
          <Skeleton className={styles.ghostTitle} />
        </div>
      </header>
      <div className={styles.body} aria-hidden="true">
        <Skeleton className={styles.ghostMeta} />
        {blocks.map((block) => (
          <div key={block} className={styles.ghostSection}>
            <Skeleton className={styles.ghostSectionTitle} />
            <Skeleton className={styles.ghostCard} />
          </div>
        ))}
      </div>
    </aside>
  );
}
