import { type TObject } from "@sinclair/typebox";
import { isTriggerNodeType } from "./flow-categories";
import { findFlowConfigProblems, type FlowConfigTable } from "./flow-config-problems";
import { flowNodeConfigSchemas, samplePayloadProblem } from "./flow-node-configs";
import { findFlowDocumentProblem, type FlowDocument, type FlowNodeType } from "./flows";
import { intervalProblem } from "./interval";
import { parseNodeConfig, secretFields } from "./node-config";
import { screenConfigSchemas } from "./screens";
import type { FlowProblem } from "./flow-problems";

export interface FlowProblemOptions {
  /** Data tables to resolve table and column references against; unchecked when absent. */
  tables?: readonly FlowConfigTable[];
  /** How to name a node whose own label is blank. Defaults to the node type. */
  fallbackLabel?: (type: FlowNodeType) => string;
}

const configSchemas: Partial<Record<FlowNodeType, TObject>> = {
  ...flowNodeConfigSchemas,
  ...screenConfigSchemas,
};

/**
 * What a node needs before a run can reach it, mirroring the preconditions its executor checks.
 * Fields that legitimately default are left out on purpose: a blank `usdc.balance` address reads
 * the run's own wallet, and AI `instructions` are optional everywhere they appear.
 */
type FieldRule = {
  field: string;
  /** Blank is a problem unless a rule opts out; a shape check still applies to a filled value. */
  optional?: true;
  /** The shape the executor parses the value into, checked only for a literal value. */
  shape?: "address" | "amount" | "decimal" | "json" | "jsonArray" | "hex";
  /** Fields a sibling setting switches on, such as the ones only one target uses. */
  when?: (config: Record<string, unknown>) => boolean;
};

const contractCall: readonly FieldRule[] = [
  { field: "address", shape: "address" },
  { field: "abi" },
  { field: "functionName" },
  { field: "args", optional: true, shape: "jsonArray" },
];

const usdcTransfer: readonly FieldRule[] = [
  { field: "to", shape: "address" },
  { field: "amount", shape: "amount" },
];

const agentTools = (config: Record<string, unknown>): readonly unknown[] =>
  Array.isArray(config.tools) ? config.tools : [];

const targetsRecord = (config: Record<string, unknown>) => config.target === "record";

const requiredConfig: Partial<Record<FlowNodeType, readonly FieldRule[]>> = {
  "trigger.onchain-event": [
    { field: "address", shape: "address" },
    { field: "event" },
    { field: "args", optional: true, shape: "json" },
  ],
  "trigger.price": [
    { field: "feed", shape: "address", when: (config) => config.pair === "custom" },
    { field: "threshold", shape: "decimal" },
  ],
  "trigger.balance": [
    { field: "address", shape: "address" },
    { field: "token", optional: true, shape: "address" },
    { field: "threshold", shape: "decimal" },
  ],
  "logic.set-variable": [{ field: "name" }],
  "logic.filter": [{ field: "items" }],
  "logic.for-each": [{ field: "items" }],
  "logic.run-code": [{ field: "code" }],
  "onchain.read-contract": contractCall,
  "onchain.write-contract": [...contractCall, { field: "value", optional: true, shape: "amount" }],
  "onchain.transfer-token": [
    { field: "to", shape: "address" },
    { field: "amount", shape: "amount" },
    { field: "token", optional: true, shape: "address" },
  ],
  "onchain.sign-message": [{ field: "message" }],
  "privy.sign-transaction": [
    { field: "to", shape: "address" },
    { field: "value", optional: true, shape: "amount" },
    { field: "data", optional: true, shape: "hex" },
  ],
  "usdc.payment": usdcTransfer,
  "usdc.payout": usdcTransfer,
  "usdc.balance": [{ field: "address", optional: true, shape: "address" }],
  "ai.generate-text": [{ field: "prompt" }],
  "ai.classify": [{ field: "labels" }],
  "ai.extract": [{ field: "schema", shape: "json" }],
  "ai.agent": [
    { field: "task" },
    { field: "allowedHosts", when: (config) => agentTools(config).includes("http_get") },
    {
      field: "discordWebhookUrl",
      when: (config) => agentTools(config).includes("discord_message"),
    },
    { field: "subgraph", when: (config) => agentTools(config).includes("query_subgraph") },
  ],
  "graph.query-subgraph": [
    { field: "subgraph" },
    { field: "query" },
    { field: "variables", optional: true, shape: "json" },
  ],
  "notify.discord": [{ field: "webhookUrl" }, { field: "content" }],
  "notify.telegram": [{ field: "botToken" }, { field: "chatId" }, { field: "text" }],
  "notify.email": [
    { field: "apiKey" },
    { field: "from" },
    { field: "to" },
    { field: "subject" },
    { field: "text" },
  ],
  "world.id-verify": [{ field: "action" }],
  "world.selfie-check": [{ field: "action" }],
  "data.update-record": [{ field: "recordId", when: targetsRecord }],
  "data.delete-record": [{ field: "recordId", when: targetsRecord }],
};

/*
 * The names the settings panel shows. A key may be qualified with its node type where the same
 * property means different things; anything left out falls back to the schema's own title.
 */
const fieldLabels: Record<string, string> = {
  webhookUrl: "Discord webhook URL",
  discordWebhookUrl: "Discord webhook URL",
  content: "message content",
  name: "variable name",
  action: "World action id",
  abi: "contract ABI",
  args: "argument list",
  functionName: "function name",
  "trigger.onchain-event.address": "contract address",
  "trigger.onchain-event.event": "event signature",
  "trigger.onchain-event.args": "argument filter",
  "trigger.price.feed": "feed address",
  "trigger.price.threshold": "price threshold",
  "trigger.balance.address": "watched address",
  "trigger.balance.token": "token address",
  "trigger.balance.threshold": "balance threshold",
  "logic.filter.items": "list of items",
  "logic.for-each.items": "list of items",
  "logic.run-code.code": "snippet of code to run",
  "onchain.sign-message.message": "message to sign",
  "ai.generate-text.prompt": "prompt",
  "ai.classify.labels": "label to choose between",
  "ai.extract.schema": "result shape",
  "ai.agent.task": "task",
  "ai.agent.allowedHosts": "allowed host for its HTTP tool",
  "ai.agent.subgraph": "subgraph for its query tool",
  "graph.query-subgraph.subgraph": "subgraph",
  "graph.query-subgraph.query": "GraphQL query",
  "notify.telegram.botToken": "Telegram bot token",
  "notify.telegram.chatId": "chat id",
  "notify.telegram.text": "message text",
  "notify.email.apiKey": "Resend API key",
  "notify.email.from": "sender address",
  "notify.email.to": "recipient address",
  "notify.email.subject": "subject line",
  "notify.email.text": "message body",
  "data.update-record.recordId": "record id",
  "data.delete-record.recordId": "record id",
};

/* So a message reads as a sentence whatever the field ends up being called. */
function article(name: string): string {
  return /^[aeiou]/i.test(name) ? "an" : "a";
}

function fieldLabel(type: FlowNodeType, field: string, schema: TObject): string {
  const named = fieldLabels[`${type}.${field}`] ?? fieldLabels[field];
  if (named) return named;
  const title = (schema.properties[field] as { title?: unknown } | undefined)?.title;
  return typeof title === "string" && title ? title.toLowerCase() : field;
}

const shapes = {
  /* Loose on purpose: the engine's own address check is stricter, and pre-flight must never
   * report a value the run would have accepted. */
  address: { test: /^0x[0-9a-fA-F]{40}$/, expected: "a 0x address" },
  amount: { test: /^\d+(\.\d+)?$/, expected: "a decimal amount, such as 1.5" },
  decimal: { test: /^-?(?:\d+(?:\.\d*)?|\.\d+)$/, expected: "a number" },
  hex: { test: /^0x[0-9a-fA-F]*$/, expected: "0x hex" },
} as const;

function shapeProblem(rule: FieldRule, value: string): string | null {
  if (rule.shape === "json" || rule.shape === "jsonArray") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      return "valid JSON";
    }
    if (rule.shape === "jsonArray") return Array.isArray(parsed) ? null : "a JSON array";
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
      return "a JSON object";
    return null;
  }
  if (!rule.shape) return null;
  const shape = shapes[rule.shape];
  return shape.test.test(value.trim()) ? null : shape.expected;
}

function isBlank(value: unknown): boolean {
  if (Array.isArray(value)) return value.every((entry) => isBlank(entry));
  return value === undefined || value === null || (typeof value === "string" && !value.trim());
}

/* A template resolves at run time, so its value is unknowable here and never a problem. */
function isTemplate(value: unknown): boolean {
  return typeof value === "string" && value.includes("{{");
}

/**
 * Everything wrong with a flow that can be seen without running it. Errors are faults that stop
 * the flow working at all; warnings are to-dos, such as a secret left blank by a fork.
 *
 * Used by the builder on every keystroke and by the API before it lets a flow go live, so the
 * canvas and the server agree on what "broken" means.
 */
export function findFlowProblems(
  document: Pick<FlowDocument, "nodes" | "edges">,
  options: FlowProblemOptions = {},
): FlowProblem[] {
  const { tables, fallbackLabel } = options;
  const problems: FlowProblem[] = [];
  const structural = findFlowDocumentProblem(document);
  if (structural) return [{ severity: "error", message: structural }];

  const triggers = document.nodes.filter((node) => isTriggerNodeType(node.type));
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
    const label = node.label || fallbackLabel?.(node.type) || node.type;
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
      for (const rule of requiredConfig[node.type] ?? []) {
        if (rule.when && !rule.when(config)) continue;
        const value = config[rule.field];
        if (isTemplate(value)) continue;
        const name = fieldLabel(node.type, rule.field, schema);
        if (isBlank(value)) {
          if (rule.optional) continue;
          // A blank secret is expected right after a fork (snapshots blank them), so it is a
          // to-do rather than a broken graph; the node still fails if the run reaches it.
          const needs = `“${label}” needs ${article(name)} ${name}`;
          problems.push(
            secrets.has(rule.field)
              ? { severity: "warning", nodeId: node.id, message: `${needs}: set your own.` }
              : { severity: "error", nodeId: node.id, message: `${needs}.` },
          );
          continue;
        }
        if (typeof value !== "string") continue;
        const expected = shapeProblem(rule, value);
        if (expected)
          problems.push({
            severity: "error",
            nodeId: node.id,
            message: `“${label}” needs its ${name} to be ${expected}.`,
          });
      }
      if (node.type === "trigger.schedule") {
        const interval = intervalProblem(String(config.every ?? ""));
        if (interval)
          problems.push({ severity: "error", nodeId: node.id, message: `“${label}” ${interval}` });
      }
      /* Rows name a column by id; the executor rejects a row that names none. The columns
       * themselves are checked against the table by findFlowConfigProblems. */
      if (node.type.startsWith("data.")) {
        const usesFilters = config.target === undefined || config.target === "filter";
        for (const key of ["values", "filters"] as const) {
          if (key === "filters" && !usesFilters) continue;
          const rows = config[key];
          if (!Array.isArray(rows)) continue;
          for (const [index, row] of rows.entries()) {
            const column = (row as { column?: unknown } | null)?.column;
            if (!isBlank(column)) continue;
            problems.push({
              severity: "error",
              nodeId: node.id,
              message: `“${label}” has a ${key === "values" ? "value" : "filter"} row ${index + 1} with no column.`,
            });
          }
        }
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
        (node.type === "world.id-verify" || node.type === "world.selfie-check") &&
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
  for (const problem of findFlowConfigProblems(document, tables))
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

/**
 * The faults that must stop a flow being activated. Warnings are deliberately not blockers: a
 * fork blanks every secret, and a flow may legitimately go live before those are filled in.
 */
export function findActivationBlockers(
  document: Pick<FlowDocument, "nodes" | "edges">,
  options: FlowProblemOptions = {},
): FlowProblem[] {
  return findFlowProblems(document, options).filter((problem) => problem.severity === "error");
}
