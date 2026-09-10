import { Type, type Static } from "@sinclair/typebox";
import { apiErrorCodeSchema, apiErrorResponses } from "./contract";
import type { FlowDocument, FlowNode } from "./flows";
import { parseNodeConfig } from "./node-config";
import { flowRunStatusSchema } from "./run-status";
import { samplePayloadField } from "./sample-payload";

/*
 * Publishing a flow as an HTTP API. A flow that starts at `trigger.api` declares the values a
 * caller sends and, through `logic.return`, the values it answers with; everything here derives
 * that declaration from the document itself, so the endpoint, the builder's curl example and the
 * MCP tool description cannot drift from the canvas.
 */

export const flowApiInputTypes = ["text", "number", "boolean", "address"] as const;
export type FlowApiInputType = (typeof flowApiInputTypes)[number];
/* Unsafe preserves the literal union that mapping to Type.Union would widen. */
export const flowApiInputTypeSchema = Type.Unsafe<FlowApiInputType>(
  Type.Union(
    flowApiInputTypes.map((type) => Type.Literal(type)),
    { default: "text" },
  ),
);

export const flowApiInputSchema = Type.Object({
  name: Type.String({ default: "", description: "Key the caller sends, such as amount." }),
  type: flowApiInputTypeSchema,
  description: Type.String({ default: "", description: "What the value means. Optional." }),
  required: Type.Boolean({ default: false }),
});
export type FlowApiInput = Static<typeof flowApiInputSchema>;

export const apiTriggerConfigSchema = Type.Object({
  description: Type.String({
    default: "",
    title: "Description",
    description: "What this endpoint does. Callers and AI agents read it to decide when to call.",
  }),
  inputs: Type.Array(flowApiInputSchema, {
    default: [],
    title: "Inputs",
    description: "The values a caller sends. They arrive together as {{input.<name>}}.",
  }),
  samplePayload: samplePayloadField({}),
});
export type ApiTriggerConfig = Static<typeof apiTriggerConfigSchema>;

export const returnOutputSchema = Type.Object({
  name: Type.String({ default: "", description: "Key in the answer, such as price." }),
  value: Type.String({ default: "", description: "What to answer with, as a {{…}} template." }),
});
export type ReturnOutput = Static<typeof returnOutputSchema>;

export const returnConfigSchema = Type.Object({
  outputs: Type.Array(returnOutputSchema, {
    default: [],
    title: "Outputs",
    description: "The values the run answers with. The first Return a run reaches wins.",
  }),
});
export type ReturnConfig = Static<typeof returnConfigSchema>;

export const apiNodeConfigSchemas = {
  "trigger.api": apiTriggerConfigSchema,
  "logic.return": returnConfigSchema,
} as const;

type NodeLike = Pick<FlowNode, "type" | "config">;

function readConfig<T>(
  config: unknown,
  schema: Parameters<typeof parseNodeConfig>[0],
  empty: T,
): T {
  try {
    return parseNodeConfig(schema, config) as T;
  } catch {
    // Settings the engine cannot read must not stop a list of callable flows being drawn.
    return empty;
  }
}

/** The flow's API trigger, or undefined when it has none. A flow has at most one that matters. */
export function findApiTrigger<T extends NodeLike>(nodes: readonly T[]): T | undefined {
  return nodes.find((node) => node.type === "trigger.api");
}

export function isApiFlow(document: { nodes: readonly NodeLike[] }): boolean {
  return findApiTrigger(document.nodes) !== undefined;
}

/** The inputs the flow declares, ignoring rows left unnamed in the editor. */
export function readFlowApiInputs(nodes: readonly NodeLike[]): FlowApiInput[] {
  const trigger = findApiTrigger(nodes);
  if (!trigger) return [];
  const config = readConfig<ApiTriggerConfig>(trigger.config, apiTriggerConfigSchema, {
    description: "",
    inputs: [],
    samplePayload: "",
  });
  return config.inputs.filter((input) => input.name.trim() !== "");
}

/** The names a run can answer with, in document order, each listed once. */
export function readFlowApiOutputs(nodes: readonly NodeLike[]): string[] {
  const names: string[] = [];
  for (const node of nodes) {
    if (node.type !== "logic.return") continue;
    const config = readConfig<ReturnConfig>(node.config, returnConfigSchema, { outputs: [] });
    for (const output of config.outputs) {
      const name = output.name.trim();
      if (name !== "" && !names.includes(name)) names.push(name);
    }
  }
  return names;
}

export interface FlowApiSchema {
  name: string;
  /** The trigger's own description; blank when the author wrote none. */
  description: string;
  inputs: FlowApiInput[];
  outputs: string[];
}

/**
 * What calling this flow looks like, or null when it is not an API flow. The single place the
 * endpoint, the curl example and any tool description are derived from.
 */
export function flowApiSchema(
  document: Pick<FlowDocument, "name"> & { nodes: readonly NodeLike[] },
): FlowApiSchema | null {
  const trigger = findApiTrigger(document.nodes);
  if (!trigger) return null;
  const config = readConfig<ApiTriggerConfig>(trigger.config, apiTriggerConfigSchema, {
    description: "",
    inputs: [],
    samplePayload: "",
  });
  return {
    name: document.name,
    description: config.description.trim(),
    inputs: config.inputs.filter((input) => input.name.trim() !== ""),
    outputs: readFlowApiOutputs(document.nodes),
  };
}

const sampleValues: Record<FlowApiInputType, unknown> = {
  text: "text",
  number: 1,
  boolean: true,
  address: "0x0000000000000000000000000000000000000000",
};

/** A body Simulate can send, built from the declaration, so the sample writes itself. */
export function sampleFlowApiInput(inputs: readonly FlowApiInput[]): Record<string, unknown> {
  return Object.fromEntries(inputs.map((input) => [input.name, sampleValues[input.type]]));
}

export const flowApiInputProblemSchema = Type.Object({
  /** The input that was wrong, or "" when the body itself was. */
  input: Type.String(),
  message: Type.String(),
});
export type FlowApiInputProblem = Static<typeof flowApiInputProblemSchema>;

/**
 * A refused invocation: the shared error code widened with the inputs that were wrong, so a
 * caller can fix its request rather than guess. `problems` is optional, which keeps this a
 * widening of `apiErrorSchema` rather than a rival.
 */
export const flowApiRefusalSchema = Type.Object({
  error: apiErrorCodeSchema,
  problems: Type.Optional(Type.Array(flowApiInputProblemSchema, { maxItems: 50 })),
});
export type FlowApiRefusal = Static<typeof flowApiRefusalSchema>;

const addressValue = /^0x[0-9a-fA-F]{40}$/;

function coerce(input: FlowApiInput, value: unknown): { value: unknown } | { message: string } {
  switch (input.type) {
    case "text":
      return typeof value === "string" ? { value } : { message: `${input.name} must be text.` };
    case "number": {
      const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
      return typeof parsed === "number" && Number.isFinite(parsed)
        ? { value: parsed }
        : { message: `${input.name} must be a number.` };
    }
    case "boolean": {
      if (typeof value === "boolean") return { value };
      const text = typeof value === "string" ? value.trim().toLowerCase() : "";
      if (text === "true") return { value: true };
      if (text === "false") return { value: false };
      return { message: `${input.name} must be true or false.` };
    }
    case "address":
      return typeof value === "string" && addressValue.test(value.trim())
        ? { value: value.trim() }
        : { message: `${input.name} must be a 0x address.` };
  }
}

/**
 * The problems as one sentence. A model retrying a tool call, or a terminal printing a failure,
 * needs a line rather than a list; both read the same wording as the fields in the builder.
 */
export function describeFlowApiProblems(problems: readonly FlowApiInputProblem[]): string {
  if (problems.length === 0) return "The input did not match what this flow declares.";
  return problems.map((problem) => problem.message).join(" ");
}

export type FlowApiInputResult =
  | { values: Record<string, unknown> }
  | { problems: FlowApiInputProblem[] };

/**
 * The caller's body checked against the declaration. Every problem is reported at once: a caller
 * fixing one field at a time learns the shape of the endpoint one round trip at a time.
 */
export function validateFlowApiInput(
  inputs: readonly FlowApiInput[],
  body: unknown,
): FlowApiInputResult {
  const source = body ?? {};
  if (typeof source !== "object" || source === null || Array.isArray(source))
    return { problems: [{ input: "", message: "The request body must be a JSON object." }] };
  const given = source as Record<string, unknown>;
  const problems: FlowApiInputProblem[] = [];
  const values: Record<string, unknown> = {};
  for (const input of inputs) {
    const raw = given[input.name];
    if (raw === undefined || raw === null) {
      if (input.required)
        problems.push({ input: input.name, message: `${input.name} is required.` });
      continue;
    }
    const result = coerce(input, raw);
    if ("message" in result) problems.push({ input: input.name, message: result.message });
    else values[input.name] = result.value;
  }
  const declared = new Set(inputs.map((input) => input.name));
  for (const key of Object.keys(given))
    if (!declared.has(key))
      problems.push({ input: key, message: `${key} is not an input of this flow.` });
  return problems.length > 0 ? { problems } : { values };
}

/* ---------------------------------------------------------------------------------------------
 * The machine-facing endpoints. They live under /v1 and are reached with an API key rather than
 * a dashboard session, so a caller's credentials cannot be replayed against the dashboard.
 * ------------------------------------------------------------------------------------------- */

export const machineApiPrefix = "/v1";

export const flowApiSummarySchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  name: Type.String(),
  description: Type.String(),
  inputs: Type.Array(flowApiInputSchema),
  outputs: Type.Array(Type.String()),
});
export type FlowApiSummary = Static<typeof flowApiSummarySchema>;

export const listApiFlowsContract = {
  method: "GET",
  path: "/v1/flows",
  response: {
    200: Type.Object({ flows: Type.Array(flowApiSummarySchema) }),
    ...apiErrorResponses,
  },
} as const;

export const flowApiResultSchema = Type.Object({
  runId: Type.String({ minLength: 1 }),
  status: flowRunStatusSchema,
  /* Empty when the flow reached no Return node; the run still says whether it succeeded. */
  output: Type.Record(Type.String(), Type.Unknown()),
});
export type FlowApiResult = Static<typeof flowApiResultSchema>;

export const invokeApiFlowContract = {
  method: "POST",
  path: "/v1/flows/:id/invoke",
  params: Type.Object({ id: Type.String({ minLength: 1 }) }),
  body: Type.Record(Type.String(), Type.Unknown()),
  response: {
    200: flowApiResultSchema,
    ...apiErrorResponses,
    422: flowApiRefusalSchema,
  },
} as const;

/** The problems in a refusal body, or an empty list when it carries none. */
export function refusedInvocationProblems(body: unknown): FlowApiInputProblem[] {
  if (typeof body !== "object" || body === null) return [];
  const problems = (body as { problems?: unknown }).problems;
  return Array.isArray(problems) ? (problems as FlowApiInputProblem[]) : [];
}
