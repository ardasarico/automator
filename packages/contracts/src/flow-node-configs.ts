import { Type, type Static } from "@sinclair/typebox";
import { conditionOperators } from "./condition-operators";
import { filterConfigSchema, mergeConfigSchema, switchConfigSchema } from "./logic-configs";
import { forEachConfigSchema, runCodeConfigSchema } from "./loop-configs";
import { emailConfigSchema, telegramMessageConfigSchema } from "./notify-configs";
import { onchainConfigSchemas, onchainEventTriggerConfigSchema } from "./onchain-configs";

/**
 * Per-type `config` schemas for the node types the flow engine runs. Every field carries a
 * `default` so `parseNodeConfig` turns an empty config into a valid one. String fields accept
 * `{{path}}` templates, resolved at run time against `input`, `vars` and `trigger`.
 */

/**
 * The sample payload a trigger hands to Simulate, as JSON text so it survives in the saved
 * document and travels through forks. `contentMediaType` tells the settings form to render a
 * JSON editor. Trigger executors never read their config, so the sample never reaches a
 * real run's output; `parseSamplePayload` is the only reader.
 */
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

/** The default sample mirrors what `POST /hooks/:flowId/:token` sends: `{ method, headers, query, body }`. */
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
  /** How often the flow runs, as a short interval such as `10m`, `1h` or `1d`. */
  every: Type.String({ default: "1h" }),
  samplePayload: samplePayloadField({}),
});
export type ScheduleTriggerConfig = Static<typeof scheduleTriggerConfigSchema>;

export const miniappOpenTriggerConfigSchema = Type.Object({
  /** Shown to visitors under the generic failure notice when the app cannot continue. */
  visitorErrorMessage: Type.String({
    default: "",
    description:
      "Shown to visitors when the app hits a problem, for example how to reach you. The error itself is never shown to them.",
  }),
  samplePayload: samplePayloadField({}),
});
export type MiniappOpenTriggerConfig = Static<typeof miniappOpenTriggerConfigSchema>;

/**
 * The trigger's sample as a value: the parsed `samplePayload` of a trigger config, or `{}`
 * when the field is absent, blank or not valid JSON, so Simulate always has a payload.
 */
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

/** Why a sample payload cannot be used, or `null`; blank text counts as the empty payload. */
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
} as const;
