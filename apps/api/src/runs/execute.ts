import type { FlowRecord, FlowRunRecord, FlowRunSource } from "@automator/contracts";
import type { FlowStore, RunStore, TriggerClaimStore } from "@automator/db";
import { runFlow, type RunOptions } from "@automator/flow-engine";

export interface RunStores {
  flows: FlowStore;
  runs: RunStore;
}

export type EngineOptions = Omit<RunOptions, "runId">;

export interface StoredRunInput {
  ownerId: string;
  record: FlowRecord;
  source: FlowRunSource;
  engine?: EngineOptions;
  claim?: { id: string; store: TriggerClaimStore };
}

/** Execution already happened; retrying the flow can repeat its external effects. */
export class RunPersistenceError extends Error {
  constructor(
    readonly record: FlowRunRecord,
    cause: unknown,
    historySaved = false,
    readonly claimCompleted = false,
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
    let claimCompleted = false;
    if (claim) {
      try {
        await claim.store.complete(claim.id, evidence, historySaved);
        claimCompleted = true;
      } catch {
        // Retain the unresolved admission; the scheduler must not advance past it.
      }
    }
    throw new RunPersistenceError(evidence, cause, historySaved, claimCompleted);
  }
}
