import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { CallableFlow, CallableFlowSource } from "./callable-flows";
import { mcpInputSchema, mcpToolDefinition, mcpToolName, type McpToolDefinition } from "./tools";

/* The name a client shows beside every tool, and prefixes onto tool names in some clients. */
export const mcpServerName = "automator";
export const mcpServerVersion = "0.1.0";

/*
 * An assistant that has just connected sees only tool names and one-line descriptions. `list_flows`
 * gives it the whole picture in a single call — ids, descriptions and input schemas — so it can
 * decide what to call without re-reading the tool list or guessing at arguments.
 */
const listFlowsTool: McpToolDefinition = {
  name: "list_flows",
  title: "List Automator flows",
  description:
    "Lists the Automator flows this API key can run, with the arguments each one takes. " +
    "Call it first when you are not sure which flow to run.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
};

function describeFlow(flow: CallableFlow) {
  return {
    tool: mcpToolName(flow),
    id: flow.id,
    name: flow.name,
    description: flow.description,
    inputSchema: mcpInputSchema(flow.inputs),
  };
}

/** Output is shown as text either way; `structuredContent` must be an object, so only one may. */
function structuredOutput(output: unknown): Record<string, unknown> | undefined {
  return typeof output === "object" && output !== null && !Array.isArray(output)
    ? (output as Record<string, unknown>)
    : undefined;
}

function toolError(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

/**
 * An MCP server presenting one owner's callable flows as tools.
 *
 * Built per request: the owner comes from the API key, so a server outlives no request and the
 * tool list is always the one that key may run.
 */
export function createFlowMcpServer({
  source,
  ownerId,
}: {
  source: CallableFlowSource;
  ownerId: string;
}): Server {
  const server = new Server(
    { name: mcpServerName, version: mcpServerVersion },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const flows = await source.list(ownerId);
    return { tools: [listFlowsTool, ...flows.map(mcpToolDefinition)] };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params;
    const flows = await source.list(ownerId);
    if (name === listFlowsTool.name) {
      const described = { flows: flows.map(describeFlow) };
      return {
        content: [{ type: "text", text: JSON.stringify(described) }],
        structuredContent: described,
      };
    }
    const flow = flows.find((candidate) => mcpToolName(candidate) === name);
    if (!flow) return toolError(`No flow of yours is published as the tool "${name}".`);

    /* A thrown error carries hostnames, ports and query text. The caller is outside the account,
     * so it hears that the run failed and nothing about where. */
    let result;
    try {
      result = await source.invoke(ownerId, flow.id, args ?? {});
    } catch {
      return toolError(`Running "${flow.name}" failed. Check the run in Automator for details.`);
    }
    if (!result.ok) return toolError(result.message);
    return {
      content: [{ type: "text", text: JSON.stringify(result.output ?? null) }],
      ...(structuredOutput(result.output) ? { structuredContent: result.output } : {}),
      _meta: { runId: result.runId, status: result.status },
    } as CallToolResult;
  });

  return server;
}
