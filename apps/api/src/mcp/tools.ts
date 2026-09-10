import type { FlowApiInputType } from "@automator/contracts";
import type { CallableFlow, CallableFlowInput } from "./callable-flows";

/*
 * An MCP client shows tool names to a model and to the person reading its output, so a flow's
 * name has to survive into the tool name rather than being replaced by its id. Two flows may
 * share a name, so the id decides: the name is a readable prefix, the id keeps it unique.
 */

/* Claude Code and Cursor prefix the server name onto ours, so leave room and stay well under 128. */
const maxToolNameLength = 64;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** A stable, unique tool name for a callable flow: its slugged name, then a slice of its id. */
export function mcpToolName(flow: { id: string; name: string }): string {
  const discriminator = flow.id
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 6);
  const suffix = discriminator ? `_${discriminator}` : "";
  let base = slugify(flow.name) || "flow";
  const room = maxToolNameLength - suffix.length;
  if (base.length > room) {
    /* Cut back to a word boundary: a name ending mid-word reads like a typo, not a shortening. */
    const cut = base.slice(0, room);
    const boundary = cut.lastIndexOf("_");
    base = (boundary > 0 ? cut.slice(0, boundary) : cut).replace(/_+$/, "") || "flow";
  }
  return `${base}${suffix}`;
}

interface McpPropertySchema {
  type: "string" | "number" | "boolean";
  description?: string;
  pattern?: string;
}

export interface McpInputSchema {
  type: "object";
  properties: Record<string, McpPropertySchema>;
  required?: string[];
  additionalProperties: false;
}

/* An address arrives as a string, so the pattern is the only thing stopping a model from
 * sending "my wallet" and the flow discovering it far downstream, mid-transaction. */
const propertySchemas: Record<FlowApiInputType, McpPropertySchema> = {
  text: { type: "string" },
  number: { type: "number" },
  boolean: { type: "boolean" },
  address: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
};

/** The JSON Schema an MCP client validates a tool call against, from a flow's declared inputs. */
export function mcpInputSchema(inputs: CallableFlowInput[]): McpInputSchema {
  const properties: Record<string, McpPropertySchema> = {};
  const required: string[] = [];
  for (const input of inputs) {
    properties[input.name] = {
      ...propertySchemas[input.type],
      ...(input.description ? { description: input.description } : {}),
    };
    if (input.required) required.push(input.name);
  }
  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
    /* A misspelled argument must fail here rather than reach the flow as a missing input. */
    additionalProperties: false,
  };
}

export interface McpToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: McpInputSchema;
}

/** One callable flow, as `tools/list` presents it. */
export function mcpToolDefinition(flow: CallableFlow): McpToolDefinition {
  return {
    name: mcpToolName(flow),
    title: flow.name,
    /* A tool with no description is one a model will not pick; say what it is instead. */
    description: flow.description.trim() || `Runs the Automator flow "${flow.name}".`,
    inputSchema: mcpInputSchema(flow.inputs),
  };
}
