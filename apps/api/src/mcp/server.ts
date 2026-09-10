import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { describeFlowApiProblems } from "@automator/contracts";
import type { InvokeOutcome } from "../api-publishing/invoke";
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

/*
 * The SDK copies a thrown error's message into the JSON-RPC error it sends back, and ours name
 * hosts, ports and database users. A caller holding an API key is outside the account, so it
 * learns that the request failed and nothing else; the real error stays in the API's own log.
 */
async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError(ErrorCode.InternalError, "The Automator API could not answer this request.");
  }
}

function toolError(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

/*
 * Every refusal reaches a model that will try again, so each one says what to do differently:
 * fix these fields, stop calling this flow, or run it somewhere a person can answer.
 */
function describeOutcome(flow: CallableFlow, outcome: InvokeOutcome): CallToolResult {
  switch (outcome.kind) {
    case "not_found":
      /* It was in the tool list a moment ago, so this is an unpublish, not a bad name. */
      return toolError(`"${flow.name}" is no longer published as an API, so it cannot be called.`);
    case "invalid_input":
      return toolError(describeFlowApiProblems(outcome.problems));
    case "waiting_on_screen":
      return toolError(
        `"${flow.name}" stops to ask its caller a question, which a tool call cannot answer. ` +
          "Run it in Automator instead.",
      );
    case "ok": {
      const { output, runId, status } = outcome.result;
      return {
        content: [{ type: "text", text: JSON.stringify(output ?? null) }],
        ...(structuredOutput(output) ? { structuredContent: output } : {}),
        _meta: { runId, status },
      } as CallToolResult;
    }
  }
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

  server.setRequestHandler(ListToolsRequestSchema, () =>
    guarded(async () => {
      const flows = await source.list(ownerId);
      return { tools: [listFlowsTool, ...flows.map(mcpToolDefinition)] };
    }),
  );

  server.setRequestHandler(CallToolRequestSchema, (request): Promise<CallToolResult> =>
    guarded(async () => {
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
      let outcome: InvokeOutcome;
      try {
        outcome = await source.invoke(ownerId, flow.id, args ?? {});
      } catch {
        return toolError(`Running "${flow.name}" failed. Check the run in Automator for details.`);
      }
      return describeOutcome(flow, outcome);
    }),
  );

  return server;
}
