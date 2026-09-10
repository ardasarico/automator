import {
  parseScreenConfig,
  secretTemplate,
  type FlowEdge,
  type FlowNode,
} from "@automator/contracts";
import type { VariableKind, VariableOption } from "../components/schema-form";
import { getCatalogEntry } from "./catalog";
import { triggerSamplePayload } from "./trigger-payload";

export type { VariableOption };

type NodeLike = Pick<FlowNode, "id" | "type" | "label" | "config">;
/** React Flow records a missing handle as null; the document as undefined. Both count as absent. */
type EdgeLike = Pick<FlowEdge, "source" | "target"> & {
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

/** Where a value lands when an edge names no target handle; mirrors the engine. */
const defaultInputHandle = "input";

const templateKey = /^[A-Za-z_][A-Za-z0-9_]*$/;

function samplePayloadKeys(trigger: Pick<FlowNode, "type" | "config">): string[] {
  const sample = triggerSamplePayload(trigger);
  if (typeof sample !== "object" || sample === null || Array.isArray(sample)) return [];
  return Object.keys(sample).filter((key) => templateKey.test(key));
}

/**
 * One entry a port offers. `path` is the trail under the port's value; the empty path is the value
 * itself, which a shaped port lists last: the object is rarely what a field wants, and offering it
 * alone is how a numeric comparison ends up reading `Number({…})`, which is NaN and never true.
 */
type OutputField = { path: string; label: string; kind?: VariableKind };

/*
 * What each port actually carries, read from the executors in packages/flow-engine. A port left out
 * here carries something only the run knows — a model's answer, a contract's return value, whatever
 * a code node returned — so it offers its value and nothing more.
 */
const outputShapes: Partial<Record<FlowNode["type"], Record<string, OutputField[]>>> = {
  "usdc.balance": {
    balance: [
      { path: "formatted", label: "Balance", kind: "number" },
      { path: "raw", label: "Balance in base units", kind: "number" },
      { path: "address", label: "Wallet address", kind: "text" },
      { path: "", label: "Balance details", kind: "object" },
    ],
  },
  "usdc.payment": {
    paid: [
      { path: "amount", label: "Amount paid", kind: "number" },
      { path: "from", label: "Payer wallet", kind: "text" },
      { path: "to", label: "Recipient", kind: "text" },
      { path: "txHash", label: "Transaction hash", kind: "text" },
      { path: "paid", label: "Paid", kind: "boolean" },
      { path: "", label: "Payment details", kind: "object" },
    ],
    declined: [{ path: "paid", label: "Paid", kind: "boolean" }],
  },
  "usdc.payout": {
    receipt: [
      { path: "amount", label: "Amount sent", kind: "number" },
      { path: "to", label: "Recipient", kind: "text" },
      { path: "hash", label: "Transaction hash", kind: "text" },
      { path: "token", label: "Token address", kind: "text" },
      { path: "simulated", label: "Simulated", kind: "boolean" },
      { path: "", label: "Receipt details", kind: "object" },
    ],
  },
  "onchain.write-contract": {
    receipt: [
      { path: "hash", label: "Transaction hash", kind: "text" },
      { path: "status", label: "Transaction status", kind: "text" },
      { path: "gas", label: "Gas estimate", kind: "number" },
      { path: "simulated", label: "Simulated", kind: "boolean" },
      { path: "", label: "Receipt details", kind: "object" },
    ],
  },
  "onchain.transfer-token": {
    receipt: [
      { path: "hash", label: "Transaction hash", kind: "text" },
      { path: "simulated", label: "Simulated", kind: "boolean" },
      { path: "", label: "Receipt details", kind: "object" },
    ],
  },
  "privy.wallet": {
    wallet: [
      { path: "address", label: "Wallet address", kind: "text" },
      { path: "chainId", label: "Chain id", kind: "number" },
      { path: "chainName", label: "Chain", kind: "text" },
      { path: "", label: "Wallet details", kind: "object" },
    ],
  },
  "privy.login": {
    user: [
      { path: "userId", label: "User id", kind: "text" },
      { path: "email", label: "Email", kind: "text" },
      { path: "wallet", label: "Wallet", kind: "text" },
      { path: "loginMethod", label: "Login method", kind: "text" },
      { path: "", label: "User details", kind: "object" },
    ],
  },
  "world.id-verify": {
    verified: [
      { path: "nullifierHash", label: "Nullifier hash", kind: "text" },
      { path: "verificationLevel", label: "Verification level", kind: "text" },
      { path: "action", label: "Action", kind: "text" },
      { path: "", label: "Verification details", kind: "object" },
    ],
    rejected: [
      { path: "code", label: "Rejection code", kind: "text" },
      { path: "detail", label: "Rejection detail", kind: "text" },
      { path: "", label: "Rejection details", kind: "object" },
    ],
  },
  "world.selfie-check": {
    verified: [
      { path: "verified", label: "Verified", kind: "boolean" },
      { path: "nullifierHash", label: "Nullifier hash", kind: "text" },
      { path: "credential", label: "Credential", kind: "text" },
      { path: "action", label: "Action", kind: "text" },
      { path: "", label: "Check details", kind: "object" },
    ],
    rejected: [
      { path: "verified", label: "Verified", kind: "boolean" },
      { path: "code", label: "Rejection code", kind: "text" },
      { path: "detail", label: "Rejection detail", kind: "text" },
      { path: "", label: "Rejection details", kind: "object" },
    ],
  },
  "notify.telegram": {
    sent: [
      { path: "messageId", label: "Message id", kind: "text" },
      { path: "chatId", label: "Chat id", kind: "text" },
      { path: "", label: "Delivery details", kind: "object" },
    ],
  },
  "notify.email": {
    sent: [
      { path: "id", label: "Email id", kind: "text" },
      { path: "to", label: "Recipients", kind: "list" },
      { path: "", label: "Delivery details", kind: "object" },
    ],
  },
  "notify.discord": {
    sent: [
      { path: "messageId", label: "Message id", kind: "text" },
      { path: "channelId", label: "Channel id", kind: "text" },
      { path: "", label: "Delivery details", kind: "object" },
    ],
  },
};

/** The named leaves of a shape, without the whole object the flow rarely wants. */
function leaves(fields: readonly OutputField[]): OutputField[] {
  return fields.filter((field) => field.path !== "");
}

/** The slice of a data table a picker needs; any list of the account's tables satisfies it. */
type TableLike = { id: string; columns: readonly { id: string; name: string }[] };

/*
 * A record travels as `{ id, tableId, values, createdAt, updatedAt }`, so a column sits under
 * `values`; `data.find-records` wraps that record in `{ records, count, first }` on `found`.
 */
function recordFields(table: TableLike, prefix: string): OutputField[] {
  return [
    { path: `${prefix}id`, label: "Record id", kind: "text" },
    ...table.columns.map((column): OutputField => ({
      path: `${prefix}values.${column.id}`,
      label: column.name,
    })),
  ];
}

function dataFields(
  source: Pick<NodeLike, "type" | "config">,
  sourceHandle: string,
  tables: readonly TableLike[],
): OutputField[] {
  const tableId = typeof source.config.tableId === "string" ? source.config.tableId.trim() : "";
  const table = tables.find((candidate) => candidate.id === tableId);
  if (!table) return [];
  if (source.type === "data.find-records")
    return sourceHandle === "found"
      ? [{ path: "count", label: "Match count", kind: "number" }, ...recordFields(table, "first.")]
      : [];
  return sourceHandle === "record" ? recordFields(table, "") : [];
}

/** A submitted form carries one value per field it defines, keyed by the field's id. */
function formFields(source: Pick<NodeLike, "config">): OutputField[] {
  return parseScreenConfig("screen.form", source.config)
    .fields.filter((field) => field.id !== "")
    .map((field) => ({ path: field.id, label: field.label || field.id, kind: "text" }));
}

/*
 * Ports that hand on exactly what arrived on one input handle, named here so a shape survives the
 * step: the bundled `usdc-balance-alert` example reads `{{input.message.formatted}}` after its
 * condition, which is only correct because the True port carries the balance the condition read.
 */
const passThroughPorts: Partial<Record<FlowNode["type"], Record<string, string>>> = {
  "logic.condition": { true: "value", false: "value" },
  "logic.wait": { done: "in" },
};

/** Stops a flow that loops back on itself from resolving pass-throughs forever. */
const maxPassThroughDepth = 4;

type Graph = {
  byId: Map<string, NodeLike>;
  edges: readonly EdgeLike[];
  tables: readonly TableLike[];
};

/** Everything a port offers, best first, with the whole value last when the shape is known. */
function portFields(
  graph: Graph,
  source: NodeLike,
  sourceHandle: string,
  rootLabel: string,
  depth = 0,
): OutputField[] {
  const shape = outputShapes[source.type]?.[sourceHandle];
  if (shape) return shape;
  const dynamic =
    source.type === "screen.form" && sourceHandle === "submitted"
      ? formFields(source)
      : source.type.startsWith("data.")
        ? dataFields(source, sourceHandle, graph.tables)
        : passThrough(graph, source, sourceHandle, depth);
  if (dynamic.length === 0) return [{ path: "", label: rootLabel }];
  return [...dynamic, { path: "", label: rootLabel, kind: "object" }];
}

/** The leaves a pass-through port inherits from whatever feeds the handle it carries. */
function passThrough(
  graph: Graph,
  source: NodeLike,
  sourceHandle: string,
  depth: number,
): OutputField[] {
  const carried = passThroughPorts[source.type]?.[sourceHandle];
  if (carried === undefined || depth >= maxPassThroughDepth) return [];
  const edge = graph.edges.find(
    (candidate) =>
      candidate.target === source.id && (candidate.targetHandle ?? defaultInputHandle) === carried,
  );
  const from = edge && graph.byId.get(edge.source);
  if (!edge || !from) return [];
  const port = getCatalogEntry(from.type).outputs.find((o) => o.id === edge.sourceHandle);
  // The port keeps its own name for the whole value; only the named leaves travel.
  return leaves(
    portFields(graph, from, edge.sourceHandle ?? "", port?.label ?? "Output", depth + 1),
  );
}

export function listVariables(
  nodeId: string,
  nodes: readonly NodeLike[],
  edges: readonly EdgeLike[],
  secretNames: readonly string[] = [],
  tables: readonly TableLike[] = [],
): VariableOption[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const graph: Graph = { byId, edges, tables };
  const options: VariableOption[] = [];

  for (const edge of edges) {
    if (edge.target !== nodeId) continue;
    const source = byId.get(edge.source);
    if (!source) continue;
    const handle = edge.targetHandle ?? defaultInputHandle;
    const port = getCatalogEntry(source.type).outputs.find((o) => o.id === edge.sourceHandle);
    const fields = portFields(graph, source, edge.sourceHandle ?? "", port?.label ?? "Output");
    for (const field of fields) {
      options.push({
        template: `{{input.${handle}${field.path === "" ? "" : `.${field.path}`}}}`,
        source: source.label,
        label: field.label,
        ...(field.kind ? { kind: field.kind } : {}),
      });
    }
  }

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
      names.add("visitor");
      for (const field of leaves(outputShapes["privy.login"]!.user!)) {
        options.push({
          template: `{{vars.visitor.${field.path}}}`,
          source: node.label,
          label: field.label,
          ...(field.kind ? { kind: field.kind } : {}),
        });
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
        : { template: "{{trigger}}", source: trigger.label, label: "Payload", kind: "object" },
    );
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
