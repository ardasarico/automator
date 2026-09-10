import type { FlowNode, FlowNodeType, Static, TObject } from "@automator/contracts";
import type { ChainProvider } from "./chain";
import type { DataProvider } from "./data";
import type { GraphGateway } from "./graph";
import type { LanguageModel } from "./language-model";

export interface ExecutionContext {
  node: FlowNode;
  inputs: Record<string, unknown>;
  trigger: unknown;
  variables: Record<string, unknown>;
  config<T extends TObject>(schema: T): Static<T>;
  fetch: typeof fetch;
  model?: LanguageModel;
  chain?: ChainProvider;
  data?: DataProvider;
  graph?: GraphGateway;
  now(): Date;
  sleep(ms: number): Promise<void>;
  signal?: AbortSignal;
  /** Retains completed work for a failed or cancelled node's audit output; never fires edges. */
  checkpoint?: (outputs: ExecutionOutputs) => void;
}

export type ExecutionOutputs = Record<string, unknown>;

export type NodeExecutor =
  | { kind: "trigger"; run(context: ExecutionContext): Promise<ExecutionOutputs> }
  | { kind: "step"; run(context: ExecutionContext): Promise<ExecutionOutputs> }
  | { kind: "screen" };

export type ExecutorRegistry = Partial<Record<FlowNodeType, NodeExecutor>>;

export class NodeExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NodeExecutionError";
  }
}
