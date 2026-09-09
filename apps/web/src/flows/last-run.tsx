"use client";

import type { FlowLastRun, FlowRunStatus } from "@automator/contracts";
import { useSyncExternalStore } from "react";
import { formatRunTime } from "../app/(workspace)/runs/local-time";
import styles from "./last-run.module.css";
import { relativeTime } from "./relative-time";

const subscribe = () => () => {};
const clientSnapshot = () => false;
const serverSnapshot = () => true;

const outcomes: Record<FlowRunStatus, string> = {
  succeeded: "Ran",
  failed: "Failed",
  waiting: "Waiting since",
};

/**
 * How the flow last ended, with its outcome carried by a dot. The relative time is only
 * right on the client, so the server renders the stamp itself rather than a time that would
 * be stale the moment it arrives.
 */
export function LastRun({ run }: { run?: FlowLastRun }) {
  const server = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  if (!run) return <span className={styles.never}>Never run</span>;
  return (
    <span className={styles.lastRun} data-status={run.status}>
      <span aria-hidden="true" className={styles.dot} />
      {outcomes[run.status]}{" "}
      <time
        dateTime={run.startedAt}
        title={formatRunTime(run.startedAt, server ? "UTC" : undefined)}
      >
        {server
          ? formatRunTime(run.startedAt, "UTC", { zone: false })
          : relativeTime(run.startedAt)}
      </time>
    </span>
  );
}
