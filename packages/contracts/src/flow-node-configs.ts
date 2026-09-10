import { Type, type Static } from "@sinclair/typebox";
import { apiNodeConfigSchemas } from "./api-publishing";
import { conditionOperators } from "./condition-operators";
import { dataNodeConfigSchemas } from "./data-node-configs";
import { defaultInterval, intervalFormats } from "./interval";
import { filterConfigSchema, mergeConfigSchema, switchConfigSchema } from "./logic-configs";
import { graphConfigSchemas } from "./graph-configs";
import { forEachConfigSchema, runCodeConfigSchema } from "./loop-configs";
import { emailConfigSchema, telegramMessageConfigSchema } from "./notify-configs";
import { onchainConfigSchemas, onchainEventTriggerConfigSchema } from "./onchain-configs";
import { watchConfigSchemas } from "./watch-configs";
import { samplePayloadField } from "./sample-payload";

export { parseSamplePayload, samplePayloadProblem } from "./sample-payload";

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
  every: Type.String({
    default: defaultInterval,
    title: "Every",
    description: `How often the flow runs, as a whole number and a unit: ${intervalFormats}. The unit is required; a bare number is not an interval.`,
  }),
  samplePayload: samplePayloadField({}),
});
export type ScheduleTriggerConfig = Static<typeof scheduleTriggerConfigSchema>;

export const miniappOpenTriggerConfigSchema = Type.Object({
  visitorErrorMessage: Type.String({
    default: "",
    advanced: true,
    description:
      "Shown to visitors when the app hits a problem, for example how to reach you. The error itself is never shown to them.",
  }),
  samplePayload: samplePayloadField({}),
});
export type MiniappOpenTriggerConfig = Static<typeof miniappOpenTriggerConfigSchema>;

export {
  conditionOperators,
  isOrderingOperator,
  orderingOperators,
  type ConditionOperator,
  type OrderingOperator,
} from "./condition-operators";
export * from "./data-node-configs";

export const conditionConfigSchema = Type.Object({
  left: Type.String({ default: "{{input.value}}", title: "Compare" }),
  operator: Type.Union(
    conditionOperators.map((operator) => Type.Literal(operator)),
    { default: "equals" },
  ),
  right: Type.String({ default: "", title: "With" }),
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
    advanced: true,
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
    advanced: true,
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
    advanced: true,
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
    advanced: true,
    title: "System instructions",
    description: "Extra guidance on how to read the text. Optional.",
  }),
});
export type ExtractConfig = Static<typeof extractConfigSchema>;

export const agentTools = [
  "http_get",
  "set_variable",
  "discord_message",
  "query_subgraph",
] as const;
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
  /* `group` and `showWhen` are form hints like `secret`: the tool settings sit under one heading,
   * and each one only shows while its tool is switched on. */
  tools: Type.Array(Type.Union(agentTools.map((tool) => Type.Literal(tool))), {
    default: [],
    group: "Tools",
    title: "Available to the agent",
    description: "The only actions this agent may take. It cannot use anything left unchecked.",
  }),
  allowedHosts: Type.Array(Type.String(), {
    default: [],
    group: "Tools",
    showWhen: { field: "tools", includes: "http_get" },
    title: "Allowed hosts",
    description:
      "Hostnames the HTTP tool may reach, such as api.example.com. Blank blocks every request.",
  }),
  discordWebhookUrl: Type.String({
    default: "",
    secret: true,
    group: "Tools",
    showWhen: { field: "tools", includes: "discord_message" },
    title: "Discord webhook",
    description: "Where the Discord tool posts.",
  }),
  subgraph: Type.String({
    default: "",
    group: "Tools",
    showWhen: { field: "tools", includes: "query_subgraph" },
    title: "Subgraph",
    description:
      "The only subgraph the query tool may read: a Subgraph ID, a deployment ID or a full query URL.",
  }),
  maxSteps: Type.Number({
    minimum: 1,
    maximum: 20,
    default: 5,
    advanced: true,
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
  ...graphConfigSchemas,
  ...dataNodeConfigSchemas,
  ...apiNodeConfigSchemas,
} as const;
