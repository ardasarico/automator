import { Type, type Static } from "@sinclair/typebox";
import { conditionOperators } from "./condition-operators";
import { filterConfigSchema, mergeConfigSchema, switchConfigSchema } from "./logic-configs";
import { forEachConfigSchema, runCodeConfigSchema } from "./loop-configs";
import { emptyConfigSchema } from "./node-config";
import { emailConfigSchema, telegramMessageConfigSchema } from "./notify-configs";
import { onchainConfigSchemas, onchainEventTriggerConfigSchema } from "./onchain-configs";

/**
 * Per-type `config` schemas for the node types the flow engine runs. Every field carries a
 * `default` so `parseNodeConfig` turns an empty config into a valid one. String fields accept
 * `{{path}}` templates, resolved at run time against `input`, `vars` and `trigger`.
 */

export const scheduleTriggerConfigSchema = Type.Object({
  /** How often the flow runs, as a short interval such as `10m`, `1h` or `1d`. */
  every: Type.String({ default: "1h" }),
});
export type ScheduleTriggerConfig = Static<typeof scheduleTriggerConfigSchema>;

export { conditionOperators, type ConditionOperator } from "./condition-operators";

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
  /** Capped so a synchronous run cannot outlive its HTTP request. */
  seconds: Type.Number({ minimum: 0, maximum: 30, default: 1 }),
});
export type WaitConfig = Static<typeof waitConfigSchema>;

export const discordMessageConfigSchema = Type.Object({
  webhookUrl: Type.String({ default: "", secret: true }),
  content: Type.String({ default: "" }),
  /** Overrides the webhook's display name when set. */
  username: Type.String({ default: "" }),
});
export type DiscordMessageConfig = Static<typeof discordMessageConfigSchema>;

export const generateTextConfigSchema = Type.Object({
  /** What the model is asked; the default passes the node's input straight through. */
  prompt: Type.String({ default: "{{input.prompt}}" }),
  /** Standing instructions, sent as the system message when not blank. */
  instructions: Type.String({ default: "" }),
});
export type GenerateTextConfig = Static<typeof generateTextConfigSchema>;

export const classifyConfigSchema = Type.Object({
  text: Type.String({ default: "{{input.text}}" }),
  /** The label set the model must pick from; the answer is always one of these. */
  labels: Type.Array(Type.String(), { default: [] }),
  instructions: Type.String({ default: "" }),
});
export type ClassifyConfig = Static<typeof classifyConfigSchema>;

export const extractConfigSchema = Type.Object({
  text: Type.String({ default: "{{input.text}}" }),
  /** A JSON schema, as text, for the object to extract; the answer is checked against it. */
  schema: Type.String({ default: '{"type":"object","properties":{}}' }),
  instructions: Type.String({ default: "" }),
});
export type ExtractConfig = Static<typeof extractConfigSchema>;

/** Everything an agent may be allowed to do; the config picks a subset. */
export const agentTools = ["http_get", "set_variable", "discord_message"] as const;
export type AgentTool = (typeof agentTools)[number];

export const agentConfigSchema = Type.Object({
  instructions: Type.String({
    default: "You are a careful assistant. Use tools only when needed.",
  }),
  task: Type.String({ default: "{{input.prompt}}" }),
  tools: Type.Array(Type.Union(agentTools.map((tool) => Type.Literal(tool))), { default: [] }),
  /** Hosts `http_get` may fetch from; anything else is refused. */
  allowedHosts: Type.Array(Type.String(), { default: [] }),
  /** Where `discord_message` posts. */
  discordWebhookUrl: Type.String({ default: "", secret: true }),
  /** Model turns before the agent is stopped as runaway. */
  maxSteps: Type.Number({ minimum: 1, maximum: 20, default: 5 }),
});
export type AgentConfig = Static<typeof agentConfigSchema>;

export const flowNodeConfigSchemas = {
  "trigger.manual": emptyConfigSchema,
  "trigger.webhook": emptyConfigSchema,
  "trigger.schedule": scheduleTriggerConfigSchema,
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
} as const;
