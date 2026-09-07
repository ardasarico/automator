import type { FlowDocument, FlowRun } from "@automator/contracts";
import type { TemplateScope } from "./template";

/** Reconstructs a screen's inputs from the fired edges, including results retained across pauses. */
export function screenScope(
  document: Pick<FlowDocument, "edges">,
  run: Pick<FlowRun, "nodes" | "variables" | "trigger">,
  nodeId: string,
): TemplateScope {
  const results = new Map(run.nodes.map((result) => [result.nodeId, result]));
  const input: Record<string, unknown> = {};
  for (const edge of document.edges) {
    if (edge.target !== nodeId) continue;
    const source = results.get(edge.source);
    if (source?.status !== "succeeded") continue;
    const outputs = source.outputs ?? {};
    const keys = Object.keys(outputs);
    const target = edge.targetHandle ?? "input";
    if (edge.sourceHandle === undefined) {
      if (keys.length) input[target] = keys.length === 1 ? outputs[keys[0]!] : outputs;
    } else if (Object.hasOwn(outputs, edge.sourceHandle)) {
      input[target] = outputs[edge.sourceHandle];
    }
  }
  return { input, vars: run.variables, trigger: run.trigger.payload };
}
