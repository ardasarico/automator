import type { FlowRecord, FlowRunRecord, FlowRunSource } from "@automator/contracts";
import type { FlowStore, RunStore } from "@automator/db";
import { runFlow, type RunOptions } from "@automator/flow-engine";

export interface RunStores {
  flows: FlowStore;
  runs: RunStore;
}

/** Everything a caller may hand the engine; `runId` stays the engine's. */
export type EngineOptions = Omit<RunOptions, "runId">;

export interface StoredRunInput {
  ownerId: string;
  /** The flow as read for the owner; the run keeps a snapshot of it. */
  record: FlowRecord;
  source: FlowRunSource;
  /** Engine options for this run: trigger, screens, secrets, chain, signal, model, and so on. */
  engine?: EngineOptions;
}

/**
 * The one way a stored flow runs: executes the record's document and records the run under
 * its owner with the source that started it. Simulate, webhooks, the scheduler and mini-app
 * sessions all go through here, so run history has one shape however a run began.
 */
export async function executeStoredRun(
  stores: RunStores,
  { ownerId, record, source, engine }: StoredRunInput,
): Promise<FlowRunRecord> {
  const run = await runFlow(record.flow, engine);
  return stores.runs.create(ownerId, record.flow, run, source);
}
