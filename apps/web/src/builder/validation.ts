import {
  findFlowDocumentProblem,
  findFlowConfigProblems,
  flowNodeConfigSchemas,
  parseNodeConfig,
  samplePayloadProblem,
  screenConfigSchemas,
  secretFields,
  type FlowDocument,
  type FlowNodeType,
  type TObject,
} from "@automator/contracts";
import { getCatalogEntry } from "./catalog";

export type FlowProblem = {
  severity: "error" | "warning";
  nodeId?: string;
  message: string;
};

const configSchemas: Partial<Record<FlowNodeType, TObject>> = {
  ...flowNodeConfigSchemas,
  ...screenConfigSchemas,
};

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

export function findFlowProblems(document: Pick<FlowDocument, "nodes" | "edges">): FlowProblem[] {
  const problems: FlowProblem[] = [];
  const structural = findFlowDocumentProblem(document);
  if (structural) return [{ severity: "error", message: structural }];

  const triggers = document.nodes.filter(
    (node) => getCatalogEntry(node.type).category === "trigger",
  );
  const targets = new Set(document.edges.map((edge) => edge.target));
  const starting = triggers.filter((node) => !targets.has(node.id));

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

  const reachable = new Set(starting.map((node) => node.id));
  const stack = [...reachable];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const edge of document.edges) {
      if (edge.source === current && !reachable.has(edge.target)) {
        reachable.add(edge.target);
        stack.push(edge.target);
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
      if (typeof config.samplePayload === "string" && samplePayloadProblem(config.samplePayload))
        problems.push({
          severity: "warning",
          nodeId: node.id,
          message: `“${label}” has a sample payload that is not valid JSON, so Simulate sends an empty one.`,
        });
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
  for (const problem of findFlowConfigProblems(document))
    problems.push({
      severity: "error",
      nodeId: problem.nodeId,
      message: `${problem.path}: ${problem.message}`,
    });
  return problems;
}

export function countErrors(problems: readonly FlowProblem[]): number {
  return problems.filter((problem) => problem.severity === "error").length;
}
