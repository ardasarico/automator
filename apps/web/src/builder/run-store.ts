import type { FlowDocument, FlowRun, FlowRunNodeResult } from "@automator/contracts";
import { createStore, type StoreApi } from "zustand";

/** `running` while the API executes; afterwards the run's own status, or `failed` with a message. */
export type RunStatus = "idle" | "running" | FlowRun["status"];

export type RunState = {
  status: RunStatus;
  /** The last finished run, kept until the next one starts. */
  run: FlowRun | null;
  /** The document this run executed, independent of subsequent canvas edits. */
  document: FlowDocument | null;
  /** Why the run could not be started or finished, when the API rather than a node failed. */
  error: string | null;
  start(): void;
  finish(run: FlowRun, document?: FlowDocument): void;
  fail(error: string): void;
  reset(): void;
  /** Shows a stored run as if it had just finished, for the history's links into the canvas. */
  loadRun(run: FlowRun, document?: FlowDocument): void;
};

export function createRunStore(
  initialRun: FlowRun | null = null,
  initialDocument: FlowDocument | null = null,
): StoreApi<RunState> {
  return createStore<RunState>((set) => ({
    status: initialRun?.status ?? "idle",
    run: initialRun,
    document: initialRun ? initialDocument : null,
    error: null,
    start: () => set({ status: "running", run: null, document: null, error: null }),
    finish: (run, document) =>
      set({ status: run.status, run, document: document ?? null, error: null }),
    fail: (error) => set({ status: "failed", run: null, document: null, error }),
    reset: () => set({ status: "idle", run: null, document: null, error: null }),
    loadRun: (run, document) =>
      set({ status: run.status, run, document: document ?? null, error: null }),
  }));
}

/** The result for one node in the last run, if it has one. */
export function selectNodeResult(id: string) {
  return (state: RunState): FlowRunNodeResult | undefined =>
    state.run?.nodes.find((node) => node.nodeId === id);
}
