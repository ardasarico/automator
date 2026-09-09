"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import type { RunRow, UpcomingRow } from "./activity-model";
import { groupByDay } from "./activity-days";
import styles from "./home.module.css";

const subscribe = () => () => {};
const onClient = () => false;
const onServer = () => true;

/**
 * Rendered on the server, where the reader's zone is unknown, and again in the browser once it
 * is: the first client render matches the server's UTC markup, then the days and clocks settle
 * into local time. Grouping and formatting share one decision, so a heading can never disagree
 * with the rows beneath it.
 */
export function ActivityBoard({
  upcoming,
  runs,
  now,
}: {
  upcoming: readonly UpcomingRow[];
  runs: readonly RunRow[];
  now: string;
}) {
  const server = useSyncExternalStore(subscribe, onClient, onServer);
  const timeZone = server ? "UTC" : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const clock = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone });
  const groups = groupByDay(runs, { now, timeZone });

  return (
    <section className={styles.activity} aria-labelledby="home-activity">
      <div className={styles.activityHead}>
        <h2 id="home-activity">Activity</h2>
        <Link href="/runs" className={styles.all}>
          All runs →
        </Link>
      </div>

      <div className={styles.board}>
        {upcoming.length > 0 && (
          <div className={styles.block}>
            <p className={styles.blockLabel}>Next up</p>
            {upcoming.map((row) => (
              <Link key={row.id} href={`/flows/${row.flowId}`} className={styles.row}>
                <span className={styles.time}>armed</span>
                <span className={styles.sentence}>
                  <i className={styles.dot} data-state="upcoming" aria-hidden="true" />
                  <span className={styles.flow}>{row.flowName}</span> {row.sentence}
                </span>
                <span className={styles.tag} />
              </Link>
            ))}
          </div>
        )}

        {groups.map((group) => (
          <div key={group.key} className={styles.block}>
            <p className={styles.blockLabel}>{group.label}</p>
            {group.rows.map((row) => (
              <Link key={row.id} href={`/runs/${row.id}`} className={styles.row}>
                <time className={styles.time} dateTime={row.at}>
                  {clock.format(new Date(row.at))}
                </time>
                <span className={styles.sentence}>
                  <i className={styles.dot} data-state={row.status} aria-hidden="true" />
                  <span className={styles.flow}>{row.flowName}</span> {row.sentence}
                  {row.reason === undefined ? null : (
                    <span className={styles.reason}>{row.reason}</span>
                  )}
                </span>
                <span className={styles.tag}>{row.source}</span>
              </Link>
            ))}
          </div>
        ))}

        {upcoming.length === 0 && runs.length === 0 && (
          <div className={styles.block}>
            <p className={styles.empty}>
              Nothing has run yet. Describe a flow above, or{" "}
              <Link href="/marketplace" className={styles.emptyLink}>
                start from an example
              </Link>
              .
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
