import type { FlowApiInput, FlowApiSummary } from "@automator/contracts";
import type { InvokeOutcome } from "../api-publishing/invoke";

/*
 * How the MCP server reaches a caller's flows.
 *
 * The types are the API-publishing ones rather than a parallel set: a tool and an HTTP call are
 * the same act, so "callable" and "invalid input" must mean one thing. The interface exists so
 * the transport and the tool mapping can be tested without a database; `./source` is the only
 * implementation that talks to one.
 */

export type CallableFlow = FlowApiSummary;
export type CallableFlowInput = FlowApiInput;

export interface CallableFlowSource {
  list(ownerId: string): Promise<CallableFlow[]>;
  invoke(ownerId: string, flowId: string, input: unknown): Promise<InvokeOutcome>;
}
