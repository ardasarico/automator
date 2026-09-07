import type { FlowDocument, FlowNode } from "./flows";
import { flowNodePorts } from "./flow-ports";

export interface FlowConfigProblem {
  nodeId: string;
  path: string;
  message: string;
}

/** Template references in nested configs, with the setting that contains each reference. */
export function templateReferences(
  value: unknown,
  path = "config",
): { path: string; reference: string }[] {
  if (typeof value === "string")
    return [...value.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((match) => ({
      path,
      reference: match[1]!.trim(),
    }));
  if (value !== null && typeof value === "object")
    return Object.entries(value).flatMap(([key, item]) =>
      templateReferences(item, `${path}.${key}`),
    );
  return [];
}

/** Semantic checks shared by AI generation and the builder; incomplete editor configs remain editable. */
export function findFlowConfigProblems(
  document: Pick<FlowDocument, "nodes" | "edges">,
): FlowConfigProblem[] {
  const problems: FlowConfigProblem[] = [];
  const nodes = new Map(document.nodes.map((node) => [node.id, node]));
  const fieldIds = (source: FlowNode, seen = new Set<string>()): string[] | undefined => {
    if (seen.has(source.id)) return undefined;
    seen.add(source.id);
    if (source.type === "screen.form" && Array.isArray(source.config.fields))
      return source.config.fields.map((field: { id?: string }) => field?.id ?? "");
    const port =
      source.type === "logic.condition" ? "value" : source.type === "logic.wait" ? "in" : undefined;
    if (!port) return undefined;
    const edge = document.edges.find(
      (edge) => edge.target === source.id && edge.targetHandle === port,
    );
    const upstream = edge && nodes.get(edge.source);
    return upstream ? fieldIds(upstream, seen) : undefined;
  };
  for (const node of document.nodes) {
    const add = (path: string, message: string) =>
      problems.push({ nodeId: node.id, path, message });
    if (node.type === "screen.form" && Array.isArray(node.config.fields)) {
      const seen = new Set<string>();
      for (const [index, field] of node.config.fields.entries()) {
        const id = field && typeof field.id === "string" ? field.id : "";
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id))
          add(
            `config.fields.${index}.id`,
            "Form fields need a nonempty identifier (letters, digits or underscores).",
          );
        else if (seen.has(id)) add(`config.fields.${index}.id`, `Duplicate form field id "${id}".`);
        seen.add(id);
      }
    }
    for (const { path, reference } of templateReferences(node.config)) {
      const [root, handle, field] = reference.split(".");
      if (!["input", "vars", "trigger", "secrets"].includes(root ?? "")) {
        add(path, `Unknown template scope "${root}".`);
        continue;
      }
      if (root !== "input") continue;
      if (!handle || !flowNodePorts[node.type].inputs.includes(handle)) {
        add(
          path,
          `"${reference}" must use this node's input handle: ${flowNodePorts[node.type].inputs.join(", ") || "none"}.`,
        );
        continue;
      }
      const edge = document.edges.find(
        (edge) => edge.target === node.id && edge.targetHandle === handle,
      );
      // Legacy editor edges omit handles; structural validation handles those independently.
      if (!edge && !document.edges.some((edge) => edge.target === node.id && !edge.targetHandle)) {
        add(path, `Input "${handle}" has no incoming connection.`);
        continue;
      }
      const source = edge && nodes.get(edge.source);
      const fields = source && fieldIds(source);
      if (fields && field && !fields.includes(field))
        add(
          path,
          `"${reference}" names an unknown form field; available fields: ${fields.join(", ")}.`,
        );
    }
  }
  return problems;
}
