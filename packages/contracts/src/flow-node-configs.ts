import { Type, type Static } from "@sinclair/typebox";
import { conditionOperators } from "./condition-operators";
import { dataNodeConfigSchemas } from "./data-node-configs";
import { filterConfigSchema, mergeConfigSchema, switchConfigSchema } from "./logic-configs";
import { forEachConfigSchema, runCodeConfigSchema } from "./loop-configs";
import { emailConfigSchema, telegramMessageConfigSchema } from "./notify-configs";
import { onchainConfigSchemas, onchainEventTriggerConfigSchema } from "./onchain-configs";
import { watchConfigSchemas } from "./watch-configs";

function samplePayloadField(sample: unknown) {
  return Type.String({
    default: JSON.stringify(sample, null, 2),
    description: "Payload Simulate hands to this trigger",
    contentMediaType: "application/json",
  });
}

export const manualTriggerConfigSchema = Type.Object({
  samplePayload: samplePayloadField({}),
});
export type ManualTriggerConfig = Static<typeof manualTriggerConfigSchema>;

export const webhookTriggerConfigSchema = Type.Object({
  samplePayload: samplePayloadField({
    method: "POST",
    headers: { "content-type": "application/json" },
    query: {},
    body: {},
  }),
});
export type WebhookTriggerConfig = Static<typeof webhookTriggerConfigSchema>;

export const scheduleTriggerConfigSchema = Type.Object({
  every: Type.String({ default: "1h" }),
  samplePayload: samplePayloadField({}),
});
export type ScheduleTriggerConfig = Static<typeof scheduleTriggerConfigSchema>;

export const miniappOpenTriggerConfigSchema = Type.Object({
  visitorErrorMessage: Type.String({
    default: "",
    description:
      "Shown to visitors when the app hits a problem, for example how to reach you. The error itself is never shown to them.",
  }),
  samplePayload: samplePayloadField({}),
});
export type MiniappOpenTriggerConfig = Static<typeof miniappOpenTriggerConfigSchema>;

export function parseSamplePayload(config: unknown): unknown {
  if (typeof config !== "object" || config === null) return {};
  const text = (config as { samplePayload?: unknown }).samplePayload;
  if (typeof text !== "string" || text.trim() === "") return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

export function samplePayloadProblem(text: string): string | null {
  if (text.trim() === "") return null;
  try {
    JSON.parse(text);
    return null;
  } catch {
    return "Invalid JSON";
  }
}

export { conditionOperators, type ConditionOperator } from "./condition-operators";
export * from "./data-node-configs";

export const conditionConfigSchema = Type.Object({
  left: Type.String({ default: "{{input.value}}" }),
  operator: Type.Union(
    conditionOperators.map((operator) => Type.Literal(operator)),
    { default: "equals" },
  ),
  right: Type.String({ default: "" }),
});
export type ConditionConfig = Static<typeof conditionConfigSchema>;

export const setVariableConfigSchema = Type.Object({
  name: Type.String({ default: "" }),
  value: Type.String({ default: "{{input.value}}" }),
});
export type SetVariableConfig = Static<typeof setVariableConfigSchema>;

export const waitConfigSchema = Type.Object({
  seconds: Type.Number({ minimum: 0, maximum: 30, default: 1 }),
});
export type WaitConfig = Static<typeof waitConfigSchema>;

export const discordMessageConfigSchema = Type.Object({
  webhookUrl: Type.String({
    default: "",
    secret: true,
    title: "Webhook URL",
    description: "The Discord channel webhook to post through.",
  }),
  content: Type.String({ default: "", title: "Message", description: "What to post." }),
  username: Type.String({
    default: "",
    title: "Post as",
    description: "Overrides the name Discord shows for the webhook. Optional.",
  }),
});
export type DiscordMessageConfig = Static<typeof discordMessageConfigSchema>;

export const generateTextConfigSchema = Type.Object({
  prompt: Type.String({
    default: "{{input.prompt}}",
    description: "What to write. Reference earlier steps with {{…}} templates.",
  }),
  instructions: Type.String({
    default: "",
    title: "System instructions",
    description: "Standing rules for the model, such as tone, length or format. Optional.",
  }),
});
export type GenerateTextConfig = Static<typeof generateTextConfigSchema>;

export const classifyConfigSchema = Type.Object({
  text: Type.String({ default: "{{input.text}}", description: "The text to classify." }),
  labels: Type.Array(Type.String(), {
    default: [],
    description: "The labels to choose between. The node outputs exactly one of them.",
  }),
  instructions: Type.String({
    default: "",
    title: "System instructions",
    description: "How to decide between the labels, when the names alone are not enough. Optional.",
  }),
});
export type ClassifyConfig = Static<typeof classifyConfigSchema>;

export const extractConfigSchema = Type.Object({
  text: Type.String({ default: "{{input.text}}", description: "The text to read values out of." }),
  schema: Type.String({
    default: '{"type":"object","properties":{}}',
    title: "Result shape",
    contentMediaType: "application/json",
    description: "A JSON Schema object describing the fields to extract.",
  }),
  instructions: Type.String({
    default: "",
    title: "System instructions",
    description: "Extra guidance on how to read the text. Optional.",
  }),
});
export type ExtractConfig = Static<typeof extractConfigSchema>;

export const agentTools = ["http_get", "set_variable", "discord_message"] as const;
export type AgentTool = (typeof agentTools)[number];

export const agentConfigSchema = Type.Object({
  instructions: Type.String({
    default: "You are a careful assistant. Use tools only when needed.",
    title: "System instructions",
    description: "Standing rules the agent follows on every step.",
  }),
  task: Type.String({
    default: "{{input.prompt}}",
    description: "What to do on this run. Reference earlier steps with {{…}} templates.",
  }),
  tools: Type.Array(Type.Union(agentTools.map((tool) => Type.Literal(tool))), {
    default: [],
    description: "The only actions this agent may take. It cannot use anything left unchecked.",
  }),
  allowedHosts: Type.Array(Type.String(), {
    default: [],
    title: "Allowed hosts",
    description:
      "Hostnames the HTTP tool may reach, such as api.example.com. Blank blocks every request.",
  }),
  discordWebhookUrl: Type.String({
    default: "",
    secret: true,
    title: "Discord webhook",
    description: "Where the Discord tool posts.",
  }),
  maxSteps: Type.Number({
    minimum: 1,
    maximum: 20,
    default: 5,
    title: "Step limit",
    description: "How many tool calls the agent may make before the run stops it.",
  }),
});
export type AgentConfig = Static<typeof agentConfigSchema>;

export const flowNodeConfigSchemas = {
  "trigger.manual": manualTriggerConfigSchema,
  "trigger.webhook": webhookTriggerConfigSchema,
  "trigger.schedule": scheduleTriggerConfigSchema,
  "trigger.miniapp-open": miniappOpenTriggerConfigSchema,
  "trigger.onchain-event": onchainEventTriggerConfigSchema,
  "logic.condition": conditionConfigSchema,
  "logic.set-variable": setVariableConfigSchema,
  "logic.wait": waitConfigSchema,
  "logic.switch": switchConfigSchema,
  "logic.merge": mergeConfigSchema,
  "logic.filter": filterConfigSchema,
  "notify.discord": discordMessageConfigSchema,
  "ai.generate-text": generateTextConfigSchema,
  "ai.classify": classifyConfigSchema,
  "ai.extract": extractConfigSchema,
  "ai.agent": agentConfigSchema,
  "notify.telegram": telegramMessageConfigSchema,
  "notify.email": emailConfigSchema,
  "logic.for-each": forEachConfigSchema,
  "logic.run-code": runCodeConfigSchema,
  ...onchainConfigSchemas,
  ...watchConfigSchemas,
  ...dataNodeConfigSchemas,
} as const;
