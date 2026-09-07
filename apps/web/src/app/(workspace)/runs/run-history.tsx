import type { FlowRunSource, FlowRunStatus, FlowRunSummary } from "@automator/contracts";
import { Badge } from "@automator/ui/badge";
import { Button } from "@automator/ui/button";
import { EmptyStateIllustration } from "@automator/ui/empty-state-illustration";
import { RiPlayCircleLine } from "@remixicon/react";
import Link from "next/link";
import styles from "../flows/flows.module.css";

const dateFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

const statusLabels: Record<
  FlowRunStatus,
  { label: string; variant: "success" | "error" | "warning" }
> = {
  succeeded: { label: "Succeeded", variant: "success" },
  failed: { label: "Failed", variant: "error" },
  waiting: { label: "Waiting", variant: "warning" },
};

const sourceLabels: Record<FlowRunSource, string> = {
  manual: "Simulate",
  webhook: "Webhook",
  schedule: "Schedule",
  miniapp: "Mini-app",
};

/** "1.2s" under a minute, "1m 05s" above it. */
export function formatDuration(startedAt: string, finishedAt: string): string {
  const ms = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

/** The caller's recent runs, newest first; each row opens the flow with that run on the canvas. */
export function RunHistory({
  runs,
  filtered = false,
}: {
  runs: readonly FlowRunSummary[];
  /** True when the list is narrowed to one flow, so the empty state says so. */
  filtered?: boolean;
}) {
  if (runs.length === 0) {
    return (
      <section className={styles.empty} aria-labelledby="runs-empty-title">
        <EmptyStateIllustration icon={<RiPlayCircleLine />} />
        <h2 id="runs-empty-title" className="mt-6 text-panel text-balance">
          {filtered ? "No runs for this flow yet" : "No runs yet"}
        </h2>
        <p className="mt-3 max-w-sm text-body text-pretty text-muted-foreground">
          {filtered
            ? "Runs appear here once Simulate, a webhook call or the schedule starts this flow."
            : "Save a flow and press Simulate on its canvas. Every run of a saved flow is kept here."}
        </p>
        <Button
          variant="outline"
          className="mt-6"
          render={<Link href={filtered ? "/runs" : "/flows"} />}
        >
          {filtered ? "Show all runs" : "Go to flows"}
        </Button>
      </section>
    );
  }
  return (
    <section aria-label="Recent runs" className={styles.collection}>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className="sr-only">Your recent runs, newest first</caption>
          <thead>
            <tr>
              <th scope="col">Flow</th>
              <th scope="col">Status</th>
              <th scope="col">Trigger</th>
              <th scope="col">Started</th>
              <th scope="col">Duration</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const status = statusLabels[run.status];
              return (
                <tr key={run.id}>
                  <th scope="row">
                    <Link
                      href={`/flows/${run.flowId}?run=${encodeURIComponent(run.id)}`}
                      className={styles.tableFlow}
                      aria-label={`Open ${run.flowName} with this run`}
                    >
                      <span className={styles.flowName}>{run.flowName}</span>
                    </Link>
                  </th>
                  <td>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </td>
                  <td>{sourceLabels[run.source]}</td>
                  <td>
                    <time dateTime={run.startedAt}>
                      {dateFormat.format(new Date(run.startedAt))}
                    </time>
                  </td>
                  <td>{formatDuration(run.startedAt, run.finishedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
