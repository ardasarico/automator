import type { FlowRunStatus, FlowRunSummary } from "@automator/contracts";
import { Badge } from "@automator/ui/badge";
import { Button } from "@automator/ui/button";
import { EmptyStateIllustration } from "@automator/ui/empty-state-illustration";
import { RiFlowChart, RiPlayCircleLine } from "@remixicon/react";
import Link from "next/link";
import flowStyles from "../flows/flows.module.css";
import { LocalTime } from "./local-time";
import { runDuration, runSourceLabels, runStatusLabels } from "./run-labels";
import styles from "./runs.module.css";

function emptyCopy(status: FlowRunStatus | undefined, filtered: boolean, older: boolean) {
  if (older)
    return {
      title: "No older runs",
      body: "There are no runs on this page. Return to the latest runs to see recent activity.",
    };
  if (status)
    return {
      title: `No ${runStatusLabels[status].label.toLowerCase()} runs`,
      body: "Nothing here matches that status. Clear the filter to see every run.",
    };
  if (filtered)
    return {
      title: "No runs for this flow yet",
      body: "Runs appear here once Simulate, a webhook call, the schedule or an onchain event starts this flow.",
    };
  return {
    title: "No runs yet",
    body: "Save a flow and press Simulate on its canvas. Every run of a saved flow is kept here.",
  };
}

export function RunHistory({
  runs,
  filtered = false,
  status,
  nextHref,
  latestHref,
}: {
  runs: readonly FlowRunSummary[];
  filtered?: boolean;
  status?: FlowRunStatus;
  nextHref?: string;
  latestHref?: string;
}) {
  if (runs.length === 0) {
    const copy = emptyCopy(status, filtered, Boolean(latestHref));
    return (
      <section className={flowStyles.empty} aria-labelledby="runs-empty-title">
        <EmptyStateIllustration icon={<RiPlayCircleLine />} />
        <h2 id="runs-empty-title" className="mt-6 text-panel text-balance">
          {copy.title}
        </h2>
        <p className="mt-3 max-w-sm text-body text-pretty text-muted-foreground">{copy.body}</p>
        <Button
          variant="outline"
          className="mt-6"
          render={<Link href={latestHref ?? (filtered ? "/runs" : "/flows")} />}
        >
          {latestHref ? "View latest runs" : filtered ? "Show all runs" : "Go to flows"}
        </Button>
      </section>
    );
  }
  return (
    <section aria-label="Recent runs" className={flowStyles.collection}>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className="sr-only">Your recent runs, newest first</caption>
          <thead>
            <tr>
              <th scope="col">Flow</th>
              <th scope="col" className={styles.status}>
                Status
              </th>
              <th scope="col" className={styles.trigger}>
                Trigger
              </th>
              <th scope="col" className={styles.started}>
                Started
              </th>
              <th scope="col" className={styles.duration}>
                Duration
              </th>
              <th scope="col" className={styles.canvas}>
                <span className="sr-only">Canvas</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const badge = runStatusLabels[run.status];
              const duration = runDuration(run.status, run.startedAt, run.finishedAt);
              return (
                <tr key={run.id}>
                  <th scope="row">
                    <Link
                      href={`/runs/${encodeURIComponent(run.id)}`}
                      className={styles.runLink}
                      aria-label={`${run.flowName} run`}
                    >
                      {run.flowName}
                    </Link>
                    {/* The reason a failure happened, so the list answers it without a click. */}
                    {run.status === "failed" && run.error && (
                      <p className={styles.reason} title={run.error}>
                        {run.error}
                      </p>
                    )}
                  </th>
                  <td className={styles.status}>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </td>
                  <td className={styles.trigger}>{runSourceLabels[run.source]}</td>
                  <td className={styles.started}>
                    <LocalTime value={run.startedAt} zone={false} />
                  </td>
                  <td className={styles.duration}>
                    {duration ?? <span className={styles.pending}>—</span>}
                  </td>
                  <td className={styles.canvas}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Open ${run.flowName} on canvas`}
                      render={
                        <Link href={`/flows/${run.flowId}?run=${encodeURIComponent(run.id)}`} />
                      }
                    >
                      <RiFlowChart aria-hidden="true" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(latestHref || nextHref) && (
        <nav aria-label="Run history pages" className="mt-6 flex flex-wrap justify-center gap-3">
          {latestHref && (
            <Button variant="outline" render={<Link href={latestHref} />}>
              View latest runs
            </Button>
          )}
          {nextHref && (
            <Button variant="outline" render={<Link href={nextHref} />}>
              View older runs
            </Button>
          )}
        </nav>
      )}
    </section>
  );
}
