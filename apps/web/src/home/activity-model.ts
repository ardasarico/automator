import type {
  FlowNodeType,
  FlowRunStatus,
  FlowRunSummary,
  FlowSummary,
} from "@automator/contracts";
import { runSourceLabels } from "../app/(workspace)/runs/run-labels";

/** Home shows a glance, not a history: Runs carries the rest. */
export const upcomingLimit = 3;
export const runLimit = 8;

export type UpcomingRow = {
  id: string;
  flowId: string;
  flowName: string;
  sentence: string;
};

export type RunRow = {
  id: string;
  flowId: string;
  flowName: string;
  status: FlowRunStatus;
  at: string;
  sentence: string;
  /** What started the run, kept beside the sentence rather than inside it. */
  source: string;
  reason: string | undefined;
};

/** Triggers that fire on their own. The rest wait for a person, so nothing is coming up. */
const armedTriggers: readonly FlowNodeType[] = [
  "trigger.schedule",
  "trigger.price",
  "trigger.balance",
  "trigger.onchain-event",
  "trigger.webhook",
];

const verbs: Record<FlowRunStatus, string> = {
  succeeded: "ran",
  failed: "failed",
  waiting: "is waiting for an answer",
};

/** An error can be a stack or a paragraph; the tape has room for its first line. */
function reasonOf(run: FlowRunSummary): string | undefined {
  const first = run.error?.split("\n")[0]?.trim();
  return first === undefined || first === "" ? undefined : first;
}

export function buildActivity({
  flows,
  runs,
}: {
  flows: readonly FlowSummary[];
  runs: readonly FlowRunSummary[];
}): { upcoming: UpcomingRow[]; runs: RunRow[] } {
  const upcoming: UpcomingRow[] = [];
  for (const flow of flows) {
    if (!flow.enabled) continue;
    for (const trigger of flow.triggers) {
      if (!armedTriggers.includes(trigger.type)) continue;
      upcoming.push({
        id: `${flow.id}:${trigger.nodeId}`,
        flowId: flow.id,
        flowName: flow.name,
        sentence: `runs ${trigger.summary}`,
      });
    }
  }
  return {
    upcoming: upcoming.slice(0, upcomingLimit),
    runs: runs.slice(0, runLimit).map((run) => ({
      id: run.id,
      flowId: run.flowId,
      flowName: run.flowName,
      status: run.status,
      at: run.startedAt,
      sentence: verbs[run.status],
      source: runSourceLabels[run.source],
      reason: reasonOf(run),
    })),
  };
}
