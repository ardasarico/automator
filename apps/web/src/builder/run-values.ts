import type { FlowDocument, FlowRun, FlowRunNodeResult } from "@automator/contracts";

/**
 * What the last run produced for one template. `missing` is kept apart from a value so the
 * builder can tell an absent path from `0`, `false` or empty text.
 */
export type TemplateValue =
  | { status: "value"; text: string }
  | { status: "missing" }
  | { status: "secret" };

const placeholder = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** Where a value lands when an edge names no target handle; mirrors the engine. */
const defaultInputHandle = "input";

export type RunScope = { input: Record<string, unknown>; vars: Record<string, unknown> };

export function templatePaths(text: string): string[] {
  const paths: string[] = [];
  for (const match of text.matchAll(placeholder)) {
    const path = match[1]!.trim();
    if (path !== "" && !paths.includes(path)) paths.push(path);
  }
  return paths;
}

/** What one upstream edge delivered, mirroring the engine's `propagate`. */
function edgeValue(
  result: FlowRunNodeResult,
  sourceHandle: string | null | undefined,
): { fired: boolean; value: unknown } {
  const outputs = result.outputs ?? {};
  const keys = Object.keys(outputs);
  if (sourceHandle === undefined || sourceHandle === null)
    return { fired: keys.length > 0, value: keys.length === 1 ? outputs[keys[0]!] : outputs };
  return { fired: Object.hasOwn(outputs, sourceHandle), value: outputs[sourceHandle] };
}

/** Rebuilds the scope the engine gave one node, from the run it recorded. */
export function nodeRunScope(
  run: Pick<FlowRun, "nodes" | "variables" | "trigger">,
  document: Pick<FlowDocument, "edges">,
  nodeId: string,
): RunScope {
  const input: Record<string, unknown> = {};
  for (const edge of document.edges) {
    if (edge.target !== nodeId) continue;
    const source = run.nodes.find((result) => result.nodeId === edge.source);
    if (!source || source.status !== "succeeded") continue;
    const { fired, value } = edgeValue(source, edge.sourceHandle);
    if (fired) input[edge.targetHandle ?? defaultInputHandle] = value;
  }
  return { input, vars: run.variables };
}

function lookup(scope: RunScope, trigger: unknown, path: string): unknown {
  const [head, ...rest] = path.split(".");
  let current: unknown =
    head === "input"
      ? scope.input
      : head === "vars"
        ? scope.vars
        : head === "trigger"
          ? trigger
          : undefined;
  if (head !== "input" && head !== "vars" && head !== "trigger") return undefined;
  for (const segment of rest) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

const maxPreviewLength = 120;

export function describeValue(value: unknown): TemplateValue {
  if (value === undefined) return { status: "missing" };
  if (value === null) return { status: "value", text: "null" };
  if (typeof value === "string")
    return { status: "value", text: value === "" ? "empty text" : `“${clip(value)}”` };
  if (typeof value === "number" || typeof value === "boolean")
    return { status: "value", text: String(value) };
  try {
    return { status: "value", text: clip(JSON.stringify(value) ?? "") };
  } catch {
    return { status: "missing" };
  }
}

function clip(text: string): string {
  return text.length > maxPreviewLength ? `${text.slice(0, maxPreviewLength)}…` : text;
}

/** Resolves one template path against a run, keeping secrets out of the preview. */
export function templateValue(scope: RunScope, trigger: unknown, path: string): TemplateValue {
  if (path === "secrets" || path.startsWith("secrets.")) return { status: "secret" };
  return describeValue(lookup(scope, trigger, path));
}
