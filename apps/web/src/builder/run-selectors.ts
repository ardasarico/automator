import type { FlowRun, FlowRunNodeResult } from "@automator/contracts";
import type { BuilderEdge } from "./document";

/**
 * What a run did with an edge: `fired` when its source produced the edge's output handle,
 * `dead` when the source finished (or was skipped) without producing it. Edges of a node that
 * never got a result, and edges outside any run, have no status.
 */
export type EdgeRunStatus = "fired" | "dead";

/**
 * A screen node that Simulate answered on the visitor's behalf carries this marker in its
 * outputs, naming the port it took. It is bookkeeping, never an output handle.
 */
export type SimulatedAnswer = { port: string };

export function simulatedAnswer(
  result: Pick<FlowRunNodeResult, "status" | "outputs">,
): SimulatedAnswer | undefined {
  if (result.status !== "succeeded") return undefined;
  const marker = result.outputs?.simulated;
  if (typeof marker !== "object" || marker === null) return undefined;
  const port = (marker as { port?: unknown }).port;
  return typeof port === "string" ? { port } : undefined;
}

/** The output handles a result produced, without the bookkeeping keys. */
export function outputHandles(result: Pick<FlowRunNodeResult, "outputs">): string[] {
  return Object.keys(result.outputs ?? {}).filter((handle) => handle !== "simulated");
}

/** The status word a card or a run row shows for a result. */
export function nodeStatusLabel(result: Pick<FlowRunNodeResult, "status" | "outputs">): string {
  if (simulatedAnswer(result)) return "Auto-answered";
  return { succeeded: "Ran", failed: "Failed", skipped: "Skipped", waiting: "Waiting" }[
    result.status
  ];
}

export function edgeRunStatus(run: FlowRun | null, edge: BuilderEdge): EdgeRunStatus | undefined {
  const source = run?.nodes.find((node) => node.nodeId === edge.source);
  if (!source) return undefined;
  if (source.status !== "succeeded") return "dead";
  const handles = outputHandles(source);
  const fired =
    edge.sourceHandle === undefined || edge.sourceHandle === null
      ? handles.length > 0
      : handles.includes(edge.sourceHandle);
  return fired ? "fired" : "dead";
}

/**
 * Transaction hashes inside one handle's output: a receipt's `hash` (or `transactionHash`),
 * at the top level or one object deep, so a `receipt` output links to its explorer page.
 */
export function transactionHashes(output: unknown): string[] {
  const hashes: string[] = [];
  const visit = (value: unknown, depth: number) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return;
    for (const [key, item] of Object.entries(value)) {
      if ((key === "hash" || key === "transactionHash") && typeof item === "string") {
        if (/^0x[0-9a-fA-F]{64}$/.test(item) && !hashes.includes(item)) hashes.push(item);
      } else if (depth < 1) visit(item, depth + 1);
    }
  };
  visit(output, 0);
  return hashes;
}

/** Whether a node error says the wallet could not pay for what the node tried to send. */
export function isInsufficientFundsError(message: string | undefined): boolean {
  return (
    message !== undefined &&
    /insufficient funds|insufficient balance|exceeds (?:the )?balance|transfer amount exceeds/i.test(
      message,
    )
  );
}

/** Milliseconds between a result's timestamps, or `undefined` when it never ran. */
export function elapsedMs(
  result: Pick<FlowRunNodeResult, "startedAt" | "finishedAt">,
): number | undefined {
  if (!result.startedAt || !result.finishedAt) return undefined;
  const elapsed = Date.parse(result.finishedAt) - Date.parse(result.startedAt);
  return Number.isNaN(elapsed) ? undefined : Math.max(0, elapsed);
}

/** `12 ms`, `1.4 s`, or `2 min 5 s`, for the inspector. */
export function formatElapsed(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds ? `${minutes} min ${seconds} s` : `${minutes} min`;
}
