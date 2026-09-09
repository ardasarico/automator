import { PageFrame } from "../../../components/page-frame";
import { Skeleton } from "../../../components/skeleton";
import chart from "./runs-chart.module.css";
import styles from "./runs.module.css";

const tiles = [0, 1, 2];
const rows = [0, 1, 2, 3, 4, 5, 6, 7];

/** The band above the list: the plot, then what it adds up to. */
function StatsSkeleton() {
  return (
    <section className={chart.band} aria-hidden="true">
      <Skeleton className={chart.ghostPlot} />
      <div className={chart.summary}>
        <div className={chart.tiles}>
          {tiles.map((tile) => (
            <div key={tile} className={chart.tile}>
              <Skeleton className={chart.ghostValue} />
              <Skeleton className={chart.ghostLabel} />
            </div>
          ))}
        </div>
        <Skeleton className={chart.ghostKey} />
      </div>
    </section>
  );
}

function Column({ label, className }: { label: string; className?: string }) {
  return (
    <th scope="col" className={className}>
      <span className={styles.ghostColumn}>{label}</span>
    </th>
  );
}

function RowSkeleton() {
  return (
    <tr>
      <th scope="row">
        <Skeleton className={styles.ghostFlow} />
      </th>
      <td className={styles.status}>
        <Skeleton className={styles.ghostBadge} />
      </td>
      <td className={styles.trigger}>
        <Skeleton className={styles.ghostCell} />
      </td>
      <td className={styles.started}>
        <Skeleton className={styles.ghostCell} />
      </td>
      <td className={styles.duration}>
        <Skeleton className={styles.ghostDuration} />
      </td>
    </tr>
  );
}

/**
 * Runs' shape while the page is being read: the frame, the band at the height its chart will
 * take, and rows on the table's own columns. The column names are known before the data is,
 * so they are written rather than drawn.
 */
export function RunsSkeleton() {
  return (
    <PageFrame title="Runs" banner={<StatsSkeleton />}>
      <p className="sr-only" role="status">
        Loading runs
      </p>
      <div className={styles.tableWrap} aria-hidden="true">
        <table className={styles.table}>
          <thead>
            <tr>
              <Column label="Flow" />
              <Column label="Status" className={styles.status} />
              <Column label="Trigger" className={styles.trigger} />
              <Column label="Started" className={styles.started} />
              <Column label="Duration" className={styles.duration} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <RowSkeleton key={row} />
            ))}
          </tbody>
        </table>
      </div>
    </PageFrame>
  );
}
