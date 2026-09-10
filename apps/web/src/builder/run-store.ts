import type { FlowDocument, FlowRun, FlowRunNodeResult } from "@automator/contracts";
import { createStore, type StoreApi } from "zustand";

type RunStatus = "idle" | "running" | FlowRun["status"];

export type RunState = {
  status: RunStatus;
  run: FlowRun | null;
  document: FlowDocument | null;
  error: string | null;
  start(): void;
  finish(run: FlowRun, document?: FlowDocument): void;
  fail(error: string): void;
  reset(): void;
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

export function selectNodeResult(id: string) {
  return (state: RunState): FlowRunNodeResult | undefined =>
    state.run?.nodes.find((node) => node.nodeId === id);
}
