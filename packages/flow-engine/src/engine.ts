import {
  forEachConfigSchema,
  NodeConfigError,
  parseNodeConfig,
  type FlowDocument,
  type FlowEdge,
  type FlowNode,
  type FlowRun,
  type FlowRunNodeResult,
  type Static,
  type TObject,
} from "@automator/contracts";
import { NodeExecutionError, type ExecutionContext, type ExecutorRegistry } from "./executor";
import { defaultExecutors } from "./executors";
import type { ChainProvider } from "./chain";
import type { LanguageModel } from "./language-model";
import type { Sandbox } from "./sandbox";
import { autoAnswer } from "./screens";
import { secretsScope, type SecretsResolver } from "./secrets";
import { resolveTemplates } from "./template";

export interface RunOptions {
  /** Which trigger fires and what it receives. Without `nodeId`, every unconnected trigger fires. */
  trigger?: { nodeId?: string; payload?: unknown };
  /**
   * Continue an earlier run from the screen it stopped at: that node counts as having just
   * produced `outputs` (the visitor's choice, keyed by output handle), `vars` starts from
   * `variables`, and nothing upstream of it runs again. `trigger.payload` still feeds templates.
   */
  resume?: {
    nodeId: string;
    outputs: Record<string, unknown>;
    variables?: Record<string, unknown>;
    /**
     * The screen could not be answered (a sign-in the host cannot verify, say): the node is
     * recorded as failed with this message instead of producing `outputs`, and the run fails.
     */
    error?: string;
  };
  /** Called as each node's result is recorded, skipped ones included, in execution order. */
  onNodeResult?: (result: FlowRunNodeResult) => void;
  /**
   * What a screen does when the run reaches it: `wait` stops the run for a visitor (the
   * default); `auto` answers it the way Simulate does, with `autoAnswer`'s synthetic output.
   */
  screens?: "wait" | "auto";
  /**
   * Answers `{{secrets.<name>}}` in node config. Only a server passes one; without it the
   * placeholders stay literal, so the builder's in-browser preview never sees a value.
   */
  secrets?: SecretsResolver;
  executors?: ExecutorRegistry;
  fetch?: typeof fetch;
  /** The chat model for AI nodes; without it they fail as unconfigured. */
  model?: LanguageModel;
  /** The chain onchain nodes use; without it they fail as unconfigured. */
  chain?: ChainProvider;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  runId?: string;
  /**
   * Cancels the run: no further node starts once it fires, the node in flight has its fetch
   * and sleep aborted, and the run finishes `failed` with a cancellation error.
   */
  signal?: AbortSignal;
  /** Where `logic.run-code` evaluates; without it those nodes fail as unavailable. */
  sandbox?: Sandbox;
}

/** The node type the engine loops over itself; see `runLoop`. */
const forEachType = "logic.for-each";

/**
 * A pass of a loop: the run starts at the for-each node as if it had just produced `item`,
 * with `vars` carried over from the previous pass. Internal to `runFlow`.
 */
type LoopPass = { nodeId: string; item: unknown; variables: Record<string, unknown> };

const cancelledMessage = "The run was cancelled.";

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/** Settles with `promise`, or rejects as soon as the signal fires. */
function withAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException(cancelledMessage, "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException(cancelledMessage, "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Where a value lands when an edge names no target handle. */
const defaultInputHandle = "input";

function describeError(error: unknown): string {
  if (isAbort(error)) return cancelledMessage;
  if (error instanceof NodeExecutionError || error instanceof NodeConfigError) return error.message;
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

/**
 * Runs one flow document to completion, in memory. Nodes run in a topological order: a node
 * runs once every incoming edge has either fired (its source produced that output handle) or
 * gone dead (the source skipped, failed, or did not produce it), and only if at least one edge
 * fired. Unconnected triggers start the run (or, with `resume`, the answered screen does); a
 * failure or a screen stops it (unless `screens` is `auto`), and every node not yet run is
 * reported as skipped. The graph must be acyclic. A `logic.for-each` node is run by the engine:
 * the nodes downstream of its `item` handle run once per item as sequential sub-runs (at most
 * `maxItems`, capped at 100; `vars` carry across; screens are not allowed inside), the canvas
 * keeps each body node's last pass, and `done` then fires with the items and per-pass results.
 */
export function runFlow(document: FlowDocument, options: RunOptions = {}): Promise<FlowRun> {
  return execute(document, options);
}

async function execute(
  document: FlowDocument,
  options: RunOptions,
  pass?: LoopPass,
): Promise<FlowRun> {
  const executors = options.executors ?? defaultExecutors;
  const now = options.now ?? (() => new Date());
  const signal = options.signal;
  const baseSleep = options.sleep ?? defaultSleep;
  const sleep = (ms: number) => withAbort(baseSleep(ms), signal);
  const baseFetch = options.fetch ?? fetch;
  // Cast: Bun's `typeof fetch` also declares `preconnect`, which executors never call.
  const fetcher = ((input: Parameters<typeof fetch>[0], init?: RequestInit) =>
    signal
      ? baseFetch(input, {
          ...init,
          signal: init?.signal ? AbortSignal.any([init.signal, signal]) : signal,
        })
      : baseFetch(input, init)) as typeof fetch;
  const startedAt = now();
  const variables: Record<string, unknown> = { ...options.resume?.variables, ...pass?.variables };
  const results = new Map<string, FlowRunNodeResult>();
  const record = (result: FlowRunNodeResult) => {
    results.set(result.nodeId, result);
    options.onNodeResult?.(result);
  };

  const finish = (
    status: FlowRun["status"],
    triggerNodeId: string | null,
    error?: string,
  ): FlowRun => ({
    id: options.runId ?? crypto.randomUUID(),
    flowId: document.id,
    status,
    startedAt: startedAt.toISOString(),
    finishedAt: now().toISOString(),
    trigger: { nodeId: triggerNodeId, payload: options.trigger?.payload },
    nodes: document.nodes.map(
      (node) => results.get(node.id) ?? { nodeId: node.id, status: "skipped" },
    ),
    variables,
    ...(error === undefined ? {} : { error }),
  });

  const nodes = new Map<string, FlowNode>();
  for (const node of document.nodes) {
    if (nodes.has(node.id)) return finish("failed", null, `Duplicate node id "${node.id}"`);
    nodes.set(node.id, node);
  }
  for (const edge of document.edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target))
      return finish("failed", null, `Edge "${edge.id}" points at a missing node`);
  }

  const incoming = new Map<string, FlowEdge[]>();
  const outgoing = new Map<string, FlowEdge[]>();
  for (const node of document.nodes) {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  }
  for (const edge of document.edges) {
    incoming.get(edge.target)!.push(edge);
    outgoing.get(edge.source)!.push(edge);
  }

  const isTrigger = (node: FlowNode) => executors[node.type]?.kind === "trigger";
  const unconnectedTriggers = document.nodes.filter(
    (node) => isTrigger(node) && incoming.get(node.id)!.length === 0,
  );
  let starting: FlowNode[];
  const requested = options.trigger?.nodeId;
  const resume = options.resume;
  if (pass !== undefined) {
    starting = [nodes.get(pass.nodeId)!];
  } else if (resume !== undefined) {
    const node = nodes.get(resume.nodeId);
    if (!node || executors[node.type]?.kind !== "screen")
      return finish("failed", null, `Node "${resume.nodeId}" is not a screen to resume from`);
    starting = [node];
  } else if (requested !== undefined) {
    const node = nodes.get(requested);
    if (!node || !isTrigger(node))
      return finish("failed", null, `Node "${requested}" is not a trigger`);
    starting = [node];
  } else {
    starting = unconnectedTriggers;
  }
  if (starting.length === 0) return finish("failed", null, "The flow has no trigger to start from");
  const triggerNodeId =
    resume === undefined && pass === undefined && starting.length === 1 ? starting[0]!.id : null;
  const startingIds = new Set(starting.map((node) => node.id));

  // Edges still unresolved per node, and the values delivered by the ones that fired.
  const pending = new Map<string, number>();
  const inputs = new Map<string, Record<string, unknown>>();
  for (const node of document.nodes) {
    pending.set(node.id, incoming.get(node.id)!.length);
    inputs.set(node.id, {});
  }

  const ready: FlowNode[] = [];
  for (const node of document.nodes) {
    if (pending.get(node.id) === 0) ready.push(node);
  }

  const resolveEdge = (edge: FlowEdge, fired: boolean, value?: unknown) => {
    if (fired) inputs.get(edge.target)![edge.targetHandle ?? defaultInputHandle] = value;
    const remaining = pending.get(edge.target)! - 1;
    pending.set(edge.target, remaining);
    if (remaining === 0) ready.push(nodes.get(edge.target)!);
  };

  const propagate = (node: FlowNode, outputs: Record<string, unknown>) => {
    const keys = Object.keys(outputs);
    for (const edge of outgoing.get(node.id)!) {
      if (edge.sourceHandle === undefined) {
        // An edge without a handle carries whatever the node produced, if anything.
        resolveEdge(edge, keys.length > 0, keys.length === 1 ? outputs[keys[0]!] : outputs);
      } else {
        resolveEdge(edge, edge.sourceHandle in outputs, outputs[edge.sourceHandle]);
      }
    }
  };

  let halted: { status: "failed" | "waiting"; error?: string } | undefined;
  // Nodes a loop already ran (their last pass is recorded); the main pass only forwards them.
  const loopHandled = new Set<string>();

  /** Every node downstream of the for-each's `item` handle: the loop body. */
  const loopBody = (node: FlowNode): Set<string> => {
    const body = new Set<string>();
    const queue = outgoing
      .get(node.id)!
      .filter((edge) => edge.sourceHandle === "item")
      .map((edge) => edge.target);
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (body.has(id)) continue;
      body.add(id);
      for (const edge of outgoing.get(id)!) queue.push(edge.target);
    }
    return body;
  };

  /**
   * Runs the loop body once per item as a sub-run seeded at the for-each node, sequentially,
   * carrying `vars` across passes. Returns the for-each node's outputs, or the pass that failed.
   */
  const runLoop = async (
    node: FlowNode,
    nodeInputs: Record<string, unknown>,
  ): Promise<{ outputs: Record<string, unknown> } | { error: string }> => {
    const secrets = await secretsScope(node.config, options.secrets);
    const scope = {
      input: nodeInputs,
      vars: variables,
      trigger: options.trigger?.payload,
      secrets,
    };
    const config = resolveTemplates(parseNodeConfig(forEachConfigSchema, node.config), scope);
    let items: unknown = config.items;
    if (typeof items === "string") {
      try {
        items = JSON.parse(items);
      } catch {
        return { error: "For each needs a list: the items did not resolve to one" };
      }
    }
    if (!Array.isArray(items))
      return { error: "For each needs a list: the items did not resolve to one" };
    const body = loopBody(node);
    for (const id of body) {
      if (executors[nodes.get(id)!.type]?.kind === "screen")
        return { error: "A screen cannot be inside a loop; move it after Done" };
    }
    const selected = items.slice(0, config.maxItems);
    const results: unknown[] = [];
    for (const [index, item] of selected.entries()) {
      if (signal?.aborted) return { error: cancelledMessage };
      const subRun = await execute(document, options, { nodeId: node.id, item, variables });
      Object.assign(variables, subRun.variables);
      for (const result of subRun.nodes) {
        if (body.has(result.nodeId)) {
          loopHandled.add(result.nodeId);
          record(result);
        }
      }
      if (subRun.status !== "succeeded") {
        const failed = subRun.nodes.find((result) => result.status === "failed");
        return {
          error: `Item ${index + 1} of ${selected.length} failed${failed?.error ? `: ${failed.error}` : ""}`,
        };
      }
      // The pass's value is what its last body node produced, in execution order.
      const last = [...subRun.nodes]
        .reverse()
        .find((result) => body.has(result.nodeId) && result.status === "succeeded");
      results.push(last?.outputs ?? null);
    }
    return {
      outputs: {
        ...(selected.length > 0 ? { item: selected.at(-1) } : {}),
        done: { items: selected, results, count: selected.length },
      },
    };
  };

  while (ready.length > 0) {
    const node = ready.shift()!;
    if (!halted && signal?.aborted) halted = { status: "failed", error: cancelledMessage };
    const nodeInputs = inputs.get(node.id)!;
    const hasIncoming = incoming.get(node.id)!.length > 0;
    const shouldRun = hasIncoming ? Object.keys(nodeInputs).length > 0 : startingIds.has(node.id);
    if (pass !== undefined && node.id === pass.nodeId) {
      // One pass of a loop: the for-each stands for its current item and nothing else fires.
      const at = now().toISOString();
      const outputs = { item: pass.item };
      record({ nodeId: node.id, status: "succeeded", startedAt: at, finishedAt: at, outputs });
      propagate(node, outputs);
      continue;
    }
    if (loopHandled.has(node.id)) {
      // Already run by the loop: forward the last pass's outputs so edges and successors resolve.
      propagate(node, results.get(node.id)?.outputs ?? {});
      continue;
    }
    if (!halted && resume !== undefined && node.id === resume.nodeId) {
      // The visitor already answered this screen: its outputs are given, not computed.
      const finishedAt = now().toISOString();
      if (resume.error !== undefined) {
        record({
          nodeId: node.id,
          status: "failed",
          startedAt: finishedAt,
          finishedAt,
          error: resume.error,
        });
        halted = { status: "failed" };
        propagate(node, {});
        continue;
      }
      record({
        nodeId: node.id,
        status: "succeeded",
        startedAt: finishedAt,
        finishedAt,
        outputs: resume.outputs,
      });
      propagate(node, resume.outputs);
      continue;
    }
    if (halted || !shouldRun) {
      record({ nodeId: node.id, status: "skipped" });
      propagate(node, {});
      continue;
    }

    if (node.type === forEachType) {
      const loopStartedAt = now().toISOString();
      const outcome = await runLoop(node, nodeInputs).catch((error: unknown) => ({
        error: describeError(error),
      }));
      const finishedAt = now().toISOString();
      if ("error" in outcome) {
        record({
          nodeId: node.id,
          status: "failed",
          startedAt: loopStartedAt,
          finishedAt,
          error: outcome.error,
        });
        halted = { status: "failed" };
        propagate(node, {});
      } else {
        record({
          nodeId: node.id,
          status: "succeeded",
          startedAt: loopStartedAt,
          finishedAt,
          outputs: outcome.outputs,
        });
        propagate(node, outcome.outputs);
      }
      continue;
    }

    const executor = executors[node.type];
    if (!executor) {
      record({
        nodeId: node.id,
        status: "failed",
        error: `Node type "${node.type}" is not implemented yet`,
      });
      halted = { status: "failed" };
      propagate(node, {});
      continue;
    }
    if (executor.kind === "screen") {
      const answer = options.screens === "auto" ? autoAnswer(node) : null;
      if (answer === null) {
        record({ nodeId: node.id, status: "waiting" });
        halted = { status: "waiting" };
        propagate(node, {});
        continue;
      }
      const answeredAt = now().toISOString();
      record({
        nodeId: node.id,
        status: "succeeded",
        startedAt: answeredAt,
        finishedAt: answeredAt,
        outputs: answer,
      });
      propagate(node, answer);
      continue;
    }

    const nodeStartedAt = now().toISOString();
    try {
      // Resolved per node, so a missing secret fails the node that names it.
      const secrets = await secretsScope(node.config, options.secrets);
      const scope = {
        input: nodeInputs,
        vars: variables,
        trigger: options.trigger?.payload,
        secrets,
      };
      const context: ExecutionContext & { sandbox?: Sandbox } = {
        node,
        inputs: nodeInputs,
        trigger: options.trigger?.payload,
        variables,
        config: <T extends TObject>(schema: T) =>
          resolveTemplates(parseNodeConfig(schema, node.config), scope) as Static<T>,
        fetch: fetcher,
        ...(options.model ? { model: options.model } : {}),
        ...(options.chain ? { chain: options.chain } : {}),
        ...(options.sandbox ? { sandbox: options.sandbox } : {}),
        now,
        sleep,
      };
      const outputs = await executor.run(context);
      record({
        nodeId: node.id,
        status: "succeeded",
        startedAt: nodeStartedAt,
        finishedAt: now().toISOString(),
        outputs,
      });
      propagate(node, outputs);
    } catch (error) {
      record({
        nodeId: node.id,
        status: "failed",
        startedAt: nodeStartedAt,
        finishedAt: now().toISOString(),
        error: describeError(error),
      });
      halted = isAbort(error)
        ? { status: "failed", error: cancelledMessage }
        : { status: "failed" };
      propagate(node, {});
    }
  }

  if (halted) return finish(halted.status, triggerNodeId, halted.error);
  const unreached = document.nodes.some((node) => pending.get(node.id)! > 0);
  if (unreached) return finish("failed", triggerNodeId, "The flow contains a cycle");
  return finish("succeeded", triggerNodeId);
}
