import type { FlowRunSummary } from "@automator/contracts";
import { Badge } from "@automator/ui/badge";
import { Button } from "@automator/ui/button";
import { EmptyStateIllustration } from "@automator/ui/empty-state-illustration";
import { RiFlowChart, RiPlayCircleLine } from "@remixicon/react";
import Link from "next/link";
import styles from "../flows/flows.module.css";
import { LocalTime } from "./local-time";
import { formatDuration, runSourceLabels, runStatusLabels } from "./run-labels";

/**
 * The caller's recent runs, newest first. A row's name opens the run's detail page; the
 * trailing button opens the flow with that run on the canvas. `nextHref` links to the next
 * page when older runs exist, so the list stays a server component.
 */
export function RunHistory({
  runs,
  filtered = false,
  nextHref,
  latestHref,
}: {
  runs: readonly FlowRunSummary[];
  /** True when the list is narrowed to one flow, so the empty state says so. */
  filtered?: boolean;
  nextHref?: string;
  /** Present on a cursor page, preserving the flow filter when returning to the latest runs. */
  latestHref?: string;
}) {
  if (runs.length === 0) {
    return (
      <section className={styles.empty} aria-labelledby="runs-empty-title">
        <EmptyStateIllustration icon={<RiPlayCircleLine />} />
        <h2 id="runs-empty-title" className="mt-6 text-panel text-balance">
          {latestHref ? "No older runs" : filtered ? "No runs for this flow yet" : "No runs yet"}
        </h2>
        <p className="mt-3 max-w-sm text-body text-pretty text-muted-foreground">
          {latestHref
            ? "There are no runs on this page. Return to the latest runs to see recent activity."
            : filtered
              ? "Runs appear here once Simulate, a webhook call, the schedule or an onchain event starts this flow."
              : "Save a flow and press Simulate on its canvas. Every run of a saved flow is kept here."}
        </p>
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
              <th scope="col">
                <span className="sr-only">Canvas</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const status = runStatusLabels[run.status];
              return (
                <tr key={run.id}>
                  <th scope="row">
                    <Link
                      href={`/runs/${encodeURIComponent(run.id)}`}
                      className={styles.tableFlow}
                      aria-label={`${run.flowName} run`}
                    >
                      <span className={styles.flowName}>{run.flowName}</span>
                    </Link>
                  </th>
                  <td>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </td>
                  <td>{runSourceLabels[run.source]}</td>
                  <td>
                    <LocalTime value={run.startedAt} />
                  </td>
                  <td>{formatDuration(run.startedAt, run.finishedAt)}</td>
                  <td className="text-end">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Open on canvas"
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
