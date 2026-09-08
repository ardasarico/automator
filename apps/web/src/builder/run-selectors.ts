import type { FlowRun, FlowRunNodeResult } from "@automator/contracts";
import type { BuilderEdge } from "./document";

export type EdgeRunStatus = "fired" | "dead";

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

export function outputHandles(result: Pick<FlowRunNodeResult, "outputs">): string[] {
  return Object.keys(result.outputs ?? {}).filter((handle) => handle !== "simulated");
}

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

export { transactionHashes } from "@automator/contracts";

export function isInsufficientFundsError(message: string | undefined): boolean {
  return (
    message !== undefined &&
    /insufficient funds|insufficient balance|exceeds (?:the )?balance|transfer amount exceeds/i.test(
      message,
    )
  );
}

export function elapsedMs(
  result: Pick<FlowRunNodeResult, "startedAt" | "finishedAt">,
): number | undefined {
  if (!result.startedAt || !result.finishedAt) return undefined;
  const elapsed = Date.parse(result.finishedAt) - Date.parse(result.startedAt);
  return Number.isNaN(elapsed) ? undefined : Math.max(0, elapsed);
}

export function formatElapsed(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds ? `${minutes} min ${seconds} s` : `${minutes} min`;
}
