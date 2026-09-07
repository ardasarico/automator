import {
  parseScreenConfig,
  secretTemplate,
  type FlowEdge,
  type FlowNode,
} from "@automator/contracts";
import { getCatalogEntry } from "./catalog";
import { triggerSamplePayload } from "./trigger-payload";

/** A `{{path}}` a node's config can use, with how to present it. */
export type VariableOption = {
  template: string;
  /** Where the value comes from: a node label, or the trigger. */
  source: string;
  /** What it is: an output port, a form field, a variable name. */
  label: string;
};

type NodeLike = Pick<FlowNode, "id" | "type" | "label" | "config">;
/** React Flow records a missing handle as null; the document as undefined. Both count as absent. */
type EdgeLike = Pick<FlowEdge, "source" | "target"> & {
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

/** Where a value lands when an edge names no target handle; mirrors the engine. */
const defaultInputHandle = "input";

/** The template path segment a key can be used as: `{{trigger.<key>}}` needs a plain name. */
const templateKey = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The top-level keys of a trigger's sample payload, when the sample is an object. */
function samplePayloadKeys(trigger: Pick<FlowNode, "type" | "config">): string[] {
  const sample = triggerSamplePayload(trigger);
  if (typeof sample !== "object" || sample === null || Array.isArray(sample)) return [];
  return Object.keys(sample).filter((key) => templateKey.test(key));
}

/** The fields an identity screen's answer carries, per output port, for the picker. */
const identityFields: Partial<Record<FlowNode["type"], Record<string, [string, string][]>>> = {
  "privy.login": {
    user: [
      ["userId", "User id"],
      ["email", "Email"],
      ["wallet", "Wallet"],
      ["loginMethod", "Login method"],
    ],
  },
  "world.id-verify": {
    verified: [
      ["nullifierHash", "Nullifier hash"],
      ["verificationLevel", "Verification level"],
      ["action", "Action"],
    ],
    rejected: [
      ["code", "Rejection code"],
      ["detail", "Rejection detail"],
    ],
  },
};

/**
 * Everything a node's templates can reach, in the order a settings menu lists it: the
 * values arriving on its input ports (one per incoming edge, plus one per field when the
 * source is a form), the variables set by nodes upstream of it, the trigger's payload, and
 * the user's secrets by name.
 */
export function listVariables(
  nodeId: string,
  nodes: readonly NodeLike[],
  edges: readonly EdgeLike[],
  secretNames: readonly string[] = [],
): VariableOption[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const options: VariableOption[] = [];

  for (const edge of edges) {
    if (edge.target !== nodeId) continue;
    const source = byId.get(edge.source);
    if (!source) continue;
    const handle = edge.targetHandle ?? defaultInputHandle;
    const port = getCatalogEntry(source.type).outputs.find((o) => o.id === edge.sourceHandle);
    options.push({
      template: `{{input.${handle}}}`,
      source: source.label,
      label: port?.label ?? "Output",
    });
    if (source.type === "screen.form") {
      for (const field of parseScreenConfig("screen.form", source.config).fields) {
        if (field.id === "") continue;
        options.push({
          template: `{{input.${handle}.${field.id}}}`,
          source: source.label,
          label: field.label || field.id,
        });
      }
    }
    const fields = identityFields[source.type]?.[edge.sourceHandle ?? ""] ?? [];
    for (const [key, label] of fields) {
      options.push({ template: `{{input.${handle}.${key}}}`, source: source.label, label });
    }
  }

  // Everything upstream, nearest first, for variables and the trigger.
  const upstream: NodeLike[] = [];
  const visited = new Set<string>([nodeId]);
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of edges) {
      if (edge.target !== current || visited.has(edge.source)) continue;
      visited.add(edge.source);
      const node = byId.get(edge.source);
      if (!node) continue;
      upstream.push(node);
      queue.push(node.id);
    }
  }

  const names = new Set<string>();
  for (const node of upstream) {
    if (node.type === "privy.login" && !names.has("visitor")) {
      // The API keeps the signed-in visitor in `vars.visitor` for every node after the login.
      names.add("visitor");
      for (const [key, label] of identityFields["privy.login"]!.user!) {
        options.push({ template: `{{vars.visitor.${key}}}`, source: node.label, label });
      }
      continue;
    }
    if (node.type !== "logic.set-variable") continue;
    const name = node.config.name;
    if (typeof name !== "string" || name === "" || names.has(name)) continue;
    names.add(name);
    options.push({ template: `{{vars.${name}}}`, source: node.label, label: name });
  }

  const trigger = upstream.find((node) => getCatalogEntry(node.type).category === "trigger");
  if (trigger) {
    options.push(
      trigger.type === "trigger.miniapp-open"
        ? { template: "{{trigger.openedAt}}", source: trigger.label, label: "Opened at" }
        : { template: "{{trigger}}", source: trigger.label, label: "Payload" },
    );
    // The sample payload's top-level keys, so a webhook flow can pick `{{trigger.body}}`.
    for (const key of samplePayloadKeys(trigger)) {
      const template = `{{trigger.${key}}}`;
      if (options.some((option) => option.template === template)) continue;
      options.push({ template, source: trigger.label, label: key });
    }
  }

  for (const name of secretNames) {
    options.push({ template: secretTemplate(name), source: "Secrets", label: name });
  }

  return options;
}
