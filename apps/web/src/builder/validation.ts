import {
  findFlowDocumentProblem,
  flowNodeConfigSchemas,
  parseNodeConfig,
  screenConfigSchemas,
  secretFields,
  type FlowDocument,
  type FlowNodeType,
  type TObject,
} from "@automator/contracts";
import { getCatalogEntry } from "./catalog";

/**
 * Something the builder should point out before a run. Errors stop a simulation from being
 * useful (the engine would fail or skip everything); warnings are worth a look but run.
 */
export type FlowProblem = {
  severity: "error" | "warning";
  /** The node at fault, or none for a problem of the whole graph. */
  nodeId?: string;
  message: string;
};

const configSchemas: Partial<Record<FlowNodeType, TObject>> = {
  ...flowNodeConfigSchemas,
  ...screenConfigSchemas,
};

/**
 * Config fields the engine refuses to run without, beyond what the schema can express: every
 * schema field has a default, so "required" here means the executor throws on the default.
 */
const requiredConfig: Partial<Record<FlowNodeType, readonly string[]>> = {
  "logic.set-variable": ["name"],
  "notify.discord": ["webhookUrl", "content"],
  "world.id-verify": ["action"],
};

const fieldLabels: Record<string, string> = {
  webhookUrl: "Discord webhook URL",
  discordWebhookUrl: "Discord webhook URL",
  content: "message content",
  name: "variable name",
  action: "World action id",
};

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && !value.trim());
}

/**
 * Every problem in the document, graph-wide ones first, then per node in document order:
 * the referential checks, a missing trigger, nodes no trigger can reach, and configs the
 * engine would reject. A blank secret is a warning that reads "set your own", since a fork
 * blanks them and the node only fails if the run reaches it.
 */
export function findFlowProblems(document: Pick<FlowDocument, "nodes" | "edges">): FlowProblem[] {
  const problems: FlowProblem[] = [];
  const structural = findFlowDocumentProblem(document);
  if (structural) return [{ severity: "error", message: structural }];

  const triggers = document.nodes.filter(
    (node) => getCatalogEntry(node.type).category === "trigger",
  );
  const incoming = new Map(document.nodes.map((node) => [node.id, 0]));
  for (const edge of document.edges)
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  const starting = triggers.filter((node) => incoming.get(node.id) === 0);

  if (document.nodes.length === 0) {
    problems.push({
      severity: "error",
      message: "The flow is empty. Add a trigger to start from.",
    });
  } else if (starting.length === 0) {
    problems.push({
      severity: "error",
      message:
        triggers.length === 0
          ? "The flow has no trigger to start from."
          : "Every trigger has an incoming edge, so none can start the flow.",
    });
  }

  // Reachability from the starting triggers, following edge direction.
  const reachable = new Set(starting.map((node) => node.id));
  const queue = [...reachable];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of document.edges) {
      if (edge.source === current && !reachable.has(edge.target)) {
        reachable.add(edge.target);
        queue.push(edge.target);
      }
    }
  }

  for (const node of document.nodes) {
    const label = node.label || getCatalogEntry(node.type).label;
    if (starting.length > 0 && !reachable.has(node.id)) {
      problems.push({
        severity: "warning",
        nodeId: node.id,
        message: `“${label}” is not connected to a trigger, so it never runs.`,
      });
    }
    const schema = configSchemas[node.type];
    if (!schema) continue;
    try {
      const config = parseNodeConfig(schema, node.config) as Record<string, unknown>;
      const secrets = new Set(secretFields(schema));
      for (const field of requiredConfig[node.type] ?? []) {
        if (!isBlank(config[field])) continue;
        const name = fieldLabels[field] ?? field;
        // A blank secret is expected right after a fork (snapshots blank them), so it is a
        // to-do rather than a broken graph; the node still fails if the run reaches it.
        problems.push(
          secrets.has(field)
            ? {
                severity: "warning",
                nodeId: node.id,
                message: `“${label}” needs a ${name}: set your own.`,
              }
            : { severity: "error", nodeId: node.id, message: `“${label}” needs a ${name}.` },
        );
      }
      if (node.type === "screen.form") {
        const fields = (config.fields as { id?: string }[] | undefined) ?? [];
        if (!fields.some((field) => field.id))
          problems.push({
            severity: "warning",
            nodeId: node.id,
            message: `“${label}” has no fields yet.`,
          });
      }
      if (
        node.type === "world.id-verify" &&
        !document.edges.some((edge) => edge.source === node.id && edge.sourceHandle === "rejected")
      ) {
        // An unwired port ends the flow, so a rejected visitor would see "All done".
        problems.push({
          severity: "warning",
          nodeId: node.id,
          message: `“${label}” has nothing on Rejected, so a failed verification ends the flow.`,
        });
      }
    } catch {
      problems.push({
        severity: "error",
        nodeId: node.id,
        message: `“${label}” has settings the engine cannot read. Reset them and try again.`,
      });
    }
  }
  return problems;
}

export function countErrors(problems: readonly FlowProblem[]): number {
  return problems.filter((problem) => problem.severity === "error").length;
}
