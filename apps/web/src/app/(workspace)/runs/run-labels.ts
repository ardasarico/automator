import type { FlowRunNodeStatus, FlowRunSource, FlowRunStatus } from "@automator/contracts";

/** A status word and the Badge variant that carries it, shared by the run table and detail page. */
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

/** "1.2s" under a minute, "1m 05s" above it. */
export function formatDuration(startedAt: string, finishedAt: string): string {
  const ms = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}
