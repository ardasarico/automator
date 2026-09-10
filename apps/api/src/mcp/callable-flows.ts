/*
 * What the MCP server needs to know about a flow, and how it reaches one.
 *
 * The API publishing work owns the derivation from a FlowDocument; this module states only the
 * shape the MCP layer consumes, so the transport and the tool mapping can be built and tested
 * against a stub. Swapping in the real source is one adapter.
 */

export type CallableFlowInputType = "text" | "number" | "boolean" | "address";

export interface CallableFlowInput {
  name: string;
  type: CallableFlowInputType;
  description?: string;
  required: boolean;
}

export interface CallableFlowOutput {
  name: string;
  type: CallableFlowInputType;
  description?: string;
}

/** A published flow a key's owner can call, with the schema its caller must satisfy. */
export interface CallableFlow {
  id: string;
  name: string;
  description: string;
  inputs: CallableFlowInput[];
  outputs: CallableFlowOutput[];
}

/** Why a call could not produce an output, in words a caller outside the account may read. */
export type InvokeRefusal = "not_found" | "invalid_input" | "waiting_on_screen" | "failed";

export type InvokeResult =
  | { ok: true; runId: string; status: string; output: unknown }
  | { ok: false; reason: InvokeRefusal; message: string };

export interface CallableFlowSource {
  list(ownerId: string): Promise<CallableFlow[]>;
  invoke(ownerId: string, flowId: string, input: Record<string, unknown>): Promise<InvokeResult>;
}
