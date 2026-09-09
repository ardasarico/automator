import type { FlowRunNodeStatus, FlowRunSource, FlowRunStatus } from "@automator/contracts";

export type StatusBadge = {
  label: string;
  variant: "success" | "error" | "warning" | "secondary";
};

export const runStatusLabels: Record<FlowRunStatus, StatusBadge> = {
  succeeded: { label: "Succeeded", variant: "success" },
  failed: { label: "Failed", variant: "error" },
  waiting: { label: "Waiting", variant: "warning" },
};

export const nodeStatusLabels: Record<FlowRunNodeStatus, StatusBadge> = {
  succeeded: { label: "Succeeded", variant: "success" },
  failed: { label: "Failed", variant: "error" },
  skipped: { label: "Skipped", variant: "secondary" },
  waiting: { label: "Waiting", variant: "warning" },
};

export const runSourceLabels: Record<FlowRunSource, string> = {
  manual: "Simulate",
  webhook: "Webhook",
  schedule: "Schedule",
  miniapp: "Mini-app",
  event: "Onchain event",
  watch: "Watch",
};

export function formatDuration(startedAt: string, finishedAt: string): string {
  const ms = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
  /* A run faster than the smallest shown digit is quick, not instant; "0.0s" reads like a bug. */
  if (ms < 50) return "<0.1s";
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

/**
 * A waiting run has not finished, so its stored `finishedAt` is only the last time it moved.
 * Reporting that gap as a duration claims the run took no time; callers show a dash instead.
 */
export function runDuration(
  status: FlowRunStatus,
  startedAt: string,
  finishedAt: string,
): string | null {
  return status === "waiting" ? null : formatDuration(startedAt, finishedAt);
}
