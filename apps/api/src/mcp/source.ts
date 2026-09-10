import { listCallableFlows } from "../api-publishing/callable-flows";
import { invokeApiFlow, type InvokeDependencies } from "../api-publishing/invoke";
import type { CallableFlowSource } from "./callable-flows";

/**
 * The MCP server's flows, taken from the same code path an HTTP caller uses.
 *
 * Nothing is decided here on purpose. A tool call and a `POST /v1/flows/:id/invoke` must agree
 * about which flows are callable, what counts as valid input, and how a run is stored, so this
 * only supplies the owner and lets `api-publishing` answer.
 */
export function createCallableFlowSource(dependencies: InvokeDependencies): CallableFlowSource {
  return {
    list: (ownerId) => listCallableFlows(dependencies.flows, ownerId),
    invoke: (ownerId, flowId, input) => invokeApiFlow(dependencies, { ownerId, flowId, input }),
  };
}
