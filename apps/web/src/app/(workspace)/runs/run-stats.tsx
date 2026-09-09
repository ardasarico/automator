import { runStatsWindowDays } from "@automator/contracts";
import { getRunStats } from "../../../flows/server";
import styles from "./runs-chart.module.css";
import { RunsChart } from "./runs-chart";

/* The legend, written here rather than over the plot: the same tokens the badges use, each
 * beside its word, so outcome is never carried by colour alone. */
const series = [
  { key: "succeeded", label: "Succeeded", token: "var(--success-foreground)" },
  { key: "failed", label: "Failed", token: "var(--destructive-text)" },
  { key: "waiting", label: "Waiting", token: "var(--warning-foreground)" },
];

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className={styles.tile}>
      <p className={styles.value}>{value}</p>
      <p className={styles.label}>{label}</p>
    </div>
  );
}

/**
 * What the last two weeks did, above the list that says what each run was. The counts come
 * from the API rather than the page of runs below: a page is a window, not a history.
 */
export async function RunStats({ flowId }: { flowId?: string }) {
  /* Not worth failing the list over; an unreachable API simply leaves the band off. */
  const stats = await getRunStats({ flowId }).catch(() => null);
  if (!stats) return null;
  const { succeeded, failed, waiting } = stats.totals;
  const total = succeeded + failed + waiting;
  if (total === 0) return null;
  const finished = succeeded + failed;
  return (
    <section className={styles.band} aria-label={`Runs over the last ${runStatsWindowDays} days`}>
      <RunsChart days={stats.days} />
      <div className={styles.summary}>
        <div className={styles.tiles}>
          <Tile value={String(total)} label={total === 1 ? "run" : "runs"} />
          <Tile value={String(failed)} label="failed" />
          <Tile
            value={finished === 0 ? "—" : `${Math.round((succeeded / finished) * 100)}%`}
            label="succeeded"
          />
        </div>
        <div className={styles.key}>
          <span className={styles.window}>Last {runStatsWindowDays} days (UTC)</span>
          <ul className={styles.legend}>
            {series.map((entry) => (
              <li key={entry.key}>
                <span aria-hidden="true" style={{ background: entry.token }} />
                {entry.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
