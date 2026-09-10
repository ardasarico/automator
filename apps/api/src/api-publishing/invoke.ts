import {
  flowChainId,
  readFlowApiInputs,
  validateFlowApiInput,
  type FlowApiInputProblem,
  type FlowApiResult,
} from "@automator/contracts";
import type { ChainFactory } from "../chain/provider";
import type { DataFactory } from "../data/provider";
import { executeStoredRun, type EngineOptions, type RunStores } from "../runs/execute";
import { callableFlow } from "./callable-flows";

/*
 * Running a published flow from a machine call. It lives outside the route handler because the
 * MCP transport calls a published flow the same way an HTTP caller does, and the two must not
 * be able to disagree about what "callable" or "invalid input" mean.
 */

export interface InvokeDependencies extends RunStores {
  engine?: EngineOptions | ((ownerId: string) => EngineOptions);
  chainFactory?: ChainFactory;
  dataFactory?: DataFactory;
}

export interface InvokeRequest {
  ownerId: string;
  flowId: string;
  input: unknown;
}

export type InvokeOutcome =
  /** The flow does not exist, is not active, or does not start at an API trigger. */
  | { kind: "not_found" }
  | { kind: "invalid_input"; problems: FlowApiInputProblem[] }
  /** The run stopped at a screen, which a machine caller has no way to answer. */
  | { kind: "waiting_on_screen"; runId: string }
  | { kind: "ok"; result: FlowApiResult };

export async function invokeApiFlow(
  { flows, runs, engine, chainFactory, dataFactory }: InvokeDependencies,
  { ownerId, flowId, input }: InvokeRequest,
): Promise<InvokeOutcome> {
  const record = await flows.find(ownerId, flowId);
  if (!record || callableFlow(record) === null) return { kind: "not_found" };
  const trigger = record.flow.nodes.find((node) => node.type === "trigger.api");
  if (!trigger) return { kind: "not_found" };

  const checked = validateFlowApiInput(readFlowApiInputs(record.flow.nodes), input);
  if ("problems" in checked) return { kind: "invalid_input", problems: checked.problems };

  const shared = typeof engine === "function" ? engine(ownerId) : engine;
  const chain = chainFactory
    ? await chainFactory.forUser(ownerId, "live", flowChainId(record.flow))
    : undefined;
  const data = dataFactory?.forOwner(ownerId, "live");
  const stored = await executeStoredRun(
    { flows, runs },
    {
      ownerId,
      record,
      source: "api",
      engine: {
        ...shared,
        ...(chain ? { chain } : {}),
        ...(data ? { data } : {}),
        trigger: { nodeId: trigger.id, payload: checked.values },
        screens: "wait",
      },
    },
  );
  const { run } = stored;
  if (run.status === "waiting") return { kind: "waiting_on_screen", runId: run.id };
  return {
    kind: "ok",
    result: { runId: run.id, status: run.status, output: run.output ?? {} },
  };
}
