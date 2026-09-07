import type { FlowDocument, FlowRun, FlowRunNodeResult } from "@automator/contracts";
import { visitorAnswer } from "@automator/contracts";
import { runFlow, type RunOptions } from "@automator/flow-engine";
import { findEntry } from "./engine";

/**
 * What the mini-app shows. A screen is held by id and looked up in the document at render
 * time, so edits to that node's config show without restarting. `running` lists the results
 * recorded so far in the run in progress, in execution order.
 */
export type SessionState =
  | { kind: "no-entry" }
  | { kind: "running"; results: FlowRunNodeResult[] }
  | { kind: "screen"; nodeId: string }
  | { kind: "end" }
  | { kind: "failed"; nodeId: string | null; error: string };

/** Engine settings the host may override: tests replace network and timers. */
export type EngineOptions = Pick<RunOptions, "fetch" | "sleep" | "executors" | "model">;

/** Where the flow stopped, as the state to show next. */
export function settleRun(run: FlowRun): SessionState {
  if (run.status === "waiting") {
    const waiting = run.nodes.find((result) => result.status === "waiting");
    return waiting ? { kind: "screen", nodeId: waiting.nodeId } : { kind: "end" };
  }
  if (run.status === "succeeded") return { kind: "end" };
  const failed = run.nodes.find((result) => result.status === "failed");
  return {
    kind: "failed",
    nodeId: failed?.nodeId ?? null,
    error: failed?.error ?? run.error ?? "The flow failed",
  };
}

export { visitorAnswer as visitorOutput } from "@automator/contracts";

/** Runs the flow from its mini-app trigger; null when the document has none. */
export function openSession(
  document: FlowDocument,
  payload: unknown,
  engine: EngineOptions,
  onNodeResult?: RunOptions["onNodeResult"],
): Promise<FlowRun> | null {
  const entry = findEntry(document);
  if (!entry) return null;
  return runFlow(document, { ...engine, trigger: { nodeId: entry.id, payload }, onNodeResult });
}

/** Continues the flow after the visitor acted on `nodeId` through `port`. */
export function continueSession(
  document: FlowDocument,
  payload: unknown,
  engine: EngineOptions,
  step: {
    nodeId: string;
    port: string;
    data?: Record<string, string>;
    variables: Record<string, unknown>;
    completed?: readonly FlowRunNodeResult[];
  },
  onNodeResult?: RunOptions["onNodeResult"],
): Promise<FlowRun> {
  return runFlow(document, {
    ...engine,
    trigger: { payload },
    resume: {
      nodeId: step.nodeId,
      outputs: { [step.port]: visitorAnswer(step.port, step.data) },
      variables: step.variables,
      completed: step.completed,
    },
    onNodeResult,
  });
}
