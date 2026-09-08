import { agentConfigSchema, type AgentTool } from "@automator/contracts";
import { chat, requireModel } from "./ai-executors";
import { postDiscordMessage } from "./discord";
import { NodeExecutionError, type ExecutionContext, type ExecutionOutputs } from "./executor";
import type { ChatMessage, ToolDefinition } from "./language-model";

export interface AgentStep {
  step: number;
  tool: string;
  arguments: Record<string, unknown>;
  result: string;
  error?: true;
}

const toolDefinitions: Record<AgentTool, ToolDefinition> = {
  http_get: {
    name: "http_get",
    description: "Fetch a URL with GET and return the response body as text.",
    parameters: {
      type: "object",
      properties: { url: { type: "string", description: "An absolute https URL" } },
      required: ["url"],
      additionalProperties: false,
    },
  },
  set_variable: {
    name: "set_variable",
    description: "Store a value in the flow's variables for later nodes.",
    parameters: {
      type: "object",
      properties: { name: { type: "string" }, value: { type: "string" } },
      required: ["name", "value"],
      additionalProperties: false,
    },
  },
  discord_message: {
    name: "discord_message",
    description: "Post a message to the configured Discord channel.",
    parameters: {
      type: "object",
      properties: { content: { type: "string" } },
      required: ["content"],
      additionalProperties: false,
    },
  },
};

const maxBodyChars = 4000;
const maxToolCalls = 100;

async function responsePrefix(response: Response, signal?: AbortSignal): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", abort, { once: true });
  const decoder = new TextDecoder();
  let text = "";
  let remainingBytes = maxBodyChars * 4;
  try {
    signal?.throwIfAborted();
    while (text.length < maxBodyChars && remainingBytes > 0) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) {
        text += decoder.decode();
        break;
      }
      const prefix = value.subarray(0, remainingBytes);
      remainingBytes -= prefix.byteLength;
      text += decoder.decode(prefix, { stream: true });
    }
    return text.slice(0, maxBodyChars);
  } finally {
    signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function hostAllowed(url: URL, allowedHosts: readonly string[]): boolean {
  return allowedHosts.some((allowed) => {
    const host = allowed.trim().toLowerCase();
    return host !== "" && (url.hostname === host || url.hostname.endsWith(`.${host}`));
  });
}

function argument(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  if (typeof value !== "string" || !value) throw new NodeExecutionError(`Missing "${name}"`);
  return value;
}

export async function runAgent(context: ExecutionContext): Promise<ExecutionOutputs> {
  const model = requireModel(context);
  const config = context.config(agentConfigSchema);
  const task = typeof config.task === "string" ? config.task : JSON.stringify(config.task);
  if (!task.trim()) throw new NodeExecutionError("AI agent needs a task");
  const allowed = new Set<AgentTool>(config.tools);
  const tools = [...allowed].map((tool) => toolDefinitions[tool]);
  const messages: ChatMessage[] = chat(config.instructions, task);
  const steps: AgentStep[] = [];

  const execute = async (name: string, args: Record<string, unknown>): Promise<string> => {
    context.signal?.throwIfAborted();
    if (!allowed.has(name as AgentTool))
      throw new NodeExecutionError(`Tool "${name}" is not allowed`);
    switch (name as AgentTool) {
      case "http_get": {
        const url = new URL(argument(args, "url"));
        if (url.protocol !== "https:" || !hostAllowed(url, config.allowedHosts))
          throw new NodeExecutionError(`Host "${url.hostname}" is not allowed`);
        const response = await context.fetch(url, { method: "GET", redirect: "manual" });
        if (response.status >= 300 && response.status < 400)
          throw new NodeExecutionError("HTTP redirects are not allowed");
        const body = await responsePrefix(response, context.signal);
        return `HTTP ${response.status}\n${body}`;
      }
      case "set_variable": {
        const key = argument(args, "name");
        context.variables[key] = args.value;
        return `Set ${key}`;
      }
      case "discord_message": {
        const delivery = await postDiscordMessage(
          context.fetch,
          config.discordWebhookUrl,
          argument(args, "content"),
        );
        return `Posted message ${delivery.messageId ?? ""}`.trim();
      }
    }
  };

  for (let step = 1; step <= config.maxSteps; step += 1) {
    context.signal?.throwIfAborted();
    const answer = await model({ messages, ...(tools.length > 0 ? { tools } : {}) });
    context.signal?.throwIfAborted();
    if (answer.toolCalls.length === 0) return { result: answer.content ?? "", steps };
    if (answer.toolCalls.length > maxToolCalls - steps.length)
      throw new NodeExecutionError(`AI agent exceeded its limit of ${maxToolCalls} tool calls`);
    messages.push({
      role: "assistant",
      content: answer.content ?? "",
      toolCalls: answer.toolCalls,
    });
    for (const call of answer.toolCalls) {
      let result: string;
      let failed = false;
      try {
        result = await execute(call.name, call.arguments);
      } catch (error) {
        if (context.signal?.aborted) throw error;
        failed = true;
        result = error instanceof Error ? error.message : String(error);
      }
      steps.push({
        step,
        tool: call.name,
        arguments: call.arguments,
        result,
        ...(failed ? { error: true as const } : {}),
      });
      context.checkpoint?.({ steps: [...steps] });
      messages.push({ role: "tool", content: result, toolCallId: call.id });
    }
  }
  throw new NodeExecutionError(
    `AI agent stopped after ${config.maxSteps} steps without a final answer`,
  );
}
