import type { FlowNode, FlowNodeType, Static, TObject } from "@automator/contracts";
import type { ChainProvider } from "./chain";
import type { LanguageModel } from "./language-model";

/** Everything a node executor may use. Executors never touch the document or other nodes. */
export interface ExecutionContext {
  node: FlowNode;
  /** Values delivered to the input handles that fired, keyed by handle id. */
  inputs: Record<string, unknown>;
  trigger: unknown;
  /** The run's `vars` scope; executors may write to it. */
  variables: Record<string, unknown>;
  /** The node's config read as `schema`, with defaults filled and templates resolved. */
  config<T extends TObject>(schema: T): Static<T>;
  fetch: typeof fetch;
  /** The chat model AI nodes call; absent when the host configured none. */
  model?: LanguageModel;
  /** The chain onchain nodes read from and write to; absent when the host configured none. */
  chain?: ChainProvider;
  now(): Date;
  sleep(ms: number): Promise<void>;
}

/** Values for output handles; an absent handle does not fire its edges. */
export type ExecutionOutputs = Record<string, unknown>;

/**
 * `trigger` executors start runs and receive the trigger payload; `step` executors run when
 * an incoming edge fires; `screen` executors are visitor pauses the engine stops at.
 */
export type NodeExecutor =
  | { kind: "trigger"; run(context: ExecutionContext): Promise<ExecutionOutputs> }
  | { kind: "step"; run(context: ExecutionContext): Promise<ExecutionOutputs> }
  | { kind: "screen" };

export type ExecutorRegistry = Partial<Record<FlowNodeType, NodeExecutor>>;

/** Raised by executors for failures the user can act on; the message becomes the node error. */
export class NodeExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NodeExecutionError";
  }
}
