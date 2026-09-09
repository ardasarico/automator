import styles from "./home.module.css";

/** The tape's shape while its rows are still being read: same card, same column, no content. */
export function ActivitySkeleton() {
  return (
    <section className={styles.activity} aria-hidden="true">
      <div className={styles.activityHead}>
        <h2>Activity</h2>
      </div>
      <div className={styles.board}>
        <div className={styles.block}>
          <p className={styles.blockLabel}>Loading</p>
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className={styles.row}>
              <span className={`${styles.time} ${styles.pulse}`} />
              <span className={`${styles.sentence} ${styles.pulse}`} data-width={row % 2} />
              <span className={`${styles.tag} ${styles.pulse}`} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
