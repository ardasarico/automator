import type { FlowRecord, FlowRunRecord, FlowRunSource } from "@automator/contracts";
import type { FlowStore, RunStore, TriggerClaimStore } from "@automator/db";
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
  /** Durable admission acquired before any unattended effects. */
  claim?: { id: string; store: TriggerClaimStore };
}

/** Execution already happened; retrying the flow can repeat its external effects. */
export class RunPersistenceError extends Error {
  constructor(
    readonly record: FlowRunRecord,
    cause: unknown,
    historySaved = false,
  ) {
    super(
      historySaved
        ? "The run history was saved, but its execution claim could not be completed."
        : "The run finished but its history could not be saved.",
      { cause },
    );
    this.name = "RunPersistenceError";
  }
}

/**
 * The one way a stored flow runs: executes the record's document and records the run under
 * its owner with the source that started it. Simulate, webhooks, the scheduler and mini-app
 * sessions all go through here, so run history has one shape however a run began.
 */
export async function executeStoredRun(
  stores: RunStores,
  { ownerId, record, source, engine, claim }: StoredRunInput,
): Promise<FlowRunRecord> {
  let run;
  try {
    run = await runFlow(record.flow, { ...engine, ...(claim ? { runId: claim.id } : {}) });
  } catch (error) {
    // Failure to persist this classification still leaves a non-retryable running claim.
    if (claim) await claim.store.markUncertain(claim.id).catch(() => {});
    throw error;
  }
  const evidence: FlowRunRecord = {
    run,
    flowName: record.flow.name,
    document: record.flow,
    source,
  };
  let historySaved = false;
  try {
    const result = await stores.runs.create(ownerId, record.flow, run, source);
    historySaved = true;
    if (claim) await claim.store.complete(claim.id, result, true);
    return result;
  } catch (cause) {
    if (claim) await claim.store.complete(claim.id, evidence, historySaved).catch(() => {});
    throw new RunPersistenceError(evidence, cause, historySaved);
  }
}
