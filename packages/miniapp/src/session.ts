import type { FlowDocument, FlowRun, FlowRunNodeResult } from "@automator/contracts";
import { visitorAnswer } from "@automator/contracts";
import { runFlow, screenScope, type TemplateScope, type RunOptions } from "@automator/flow-engine";
import { findEntry } from "./engine";

export type SessionState =
  | { kind: "no-entry" }
  | { kind: "running"; results: FlowRunNodeResult[] }
  | { kind: "screen"; nodeId: string; scope?: TemplateScope }
  | { kind: "end" }
  | { kind: "failed"; nodeId: string | null; error: string };

export type EngineOptions = Pick<RunOptions, "fetch" | "sleep" | "executors" | "model">;

export function settleRun(run: FlowRun, document?: FlowDocument): SessionState {
  if (run.status === "waiting") {
    const waiting = run.nodes.find((result) => result.status === "waiting");
    return waiting
      ? {
          kind: "screen",
          nodeId: waiting.nodeId,
          ...(document ? { scope: screenScope(document, run, waiting.nodeId) } : {}),
        }
      : { kind: "end" };
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

export function openSession(
  document: FlowDocument,
  payload: unknown,
  engine: EngineOptions,
  onNodeResult?: RunOptions["onNodeResult"],
  signal?: AbortSignal,
): Promise<FlowRun> | null {
  const entry = findEntry(document);
  if (!entry) return null;
  return runFlow(document, {
    ...engine,
    trigger: { nodeId: entry.id, payload },
    onNodeResult,
    signal,
  });
}

export function continueSession(
  document: FlowDocument,
  payload: unknown,
  engine: EngineOptions,
  step: {
    nodeId: string;
    port: string;
    data?: Record<string, unknown>;
    variables: Record<string, unknown>;
    completed?: readonly FlowRunNodeResult[];
  },
  onNodeResult?: RunOptions["onNodeResult"],
  signal?: AbortSignal,
): Promise<FlowRun> {
  return runFlow(document, {
    ...engine,
    signal,
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
