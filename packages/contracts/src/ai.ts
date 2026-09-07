import { Type, type Static } from "@sinclair/typebox";
import { apiErrorResponses } from "./contract";
import { flowRunNodeResultSchema, flowRunStatusSchema, flowRunTriggerSchema } from "./flow-runs";
import { flowDocumentInputSchema } from "./flows";

/** How many prior turns a request may carry; the API sends the model fewer still. */
export const aiHistoryLimit = 40;

/**
 * One earlier turn of the AI conversation. Assistant turns carry only the summary or message
 * the user saw, never the document they proposed, so a long thread stays a small prompt.
 */
export const aiHistoryTurnSchema = Type.Object({
  role: Type.Union([Type.Literal("user"), Type.Literal("assistant")]),
  text: Type.String({ maxLength: 4000 }),
});
export type AiHistoryTurn = Static<typeof aiHistoryTurnSchema>;

/**
 * Asks the model for a flow. Without `document` it designs a new one from the prompt; with
 * it, the prompt is an instruction to change that document. `history` is the conversation so
 * far, oldest first, so a follow-up such as "also notify Discord" reads in context. The answer
 * is either a complete document input the canvas can apply as it is, laid out left to right,
 * or a plain message when the prompt was a question rather than a change request.
 */
export const generateFlowRequestSchema = Type.Object({
  prompt: Type.String({ minLength: 1, maxLength: 4000 }),
  document: Type.Optional(flowDocumentInputSchema),
  history: Type.Optional(Type.Array(aiHistoryTurnSchema, { maxItems: aiHistoryLimit })),
});
export type GenerateFlowRequest = Static<typeof generateFlowRequestSchema>;

export const aiFlowAnswerSchema = Type.Object({
  kind: Type.Literal("flow"),
  document: flowDocumentInputSchema,
  /** One or two sentences from the model on what the flow does or what changed. */
  summary: Type.String(),
});
export type AiFlowAnswer = Static<typeof aiFlowAnswerSchema>;

export const aiMessageAnswerSchema = Type.Object({
  kind: Type.Literal("message"),
  text: Type.String(),
});
export type AiMessageAnswer = Static<typeof aiMessageAnswerSchema>;

/** What the AI answers: a proposed flow to apply, or text only. The user applies; the model never does. */
export const generateFlowResponseSchema = Type.Union([aiFlowAnswerSchema, aiMessageAnswerSchema]);
export type GenerateFlowResponse = Static<typeof generateFlowResponseSchema>;

export const generateFlowContract = {
  method: "POST",
  path: "/ai/flows",
  body: generateFlowRequestSchema,
  response: { 200: generateFlowResponseSchema, ...apiErrorResponses },
} as const;

/**
 * Asks the model why a run failed and how to fix it. The document travels with its secret
 * config fields redacted (`redactFlowSecrets`) and the node outputs through
 * `redactRunOutputs`; `nodeId` names the failed node to explain when the run has several.
 */
export const explainRunRequestSchema = Type.Object({
  document: flowDocumentInputSchema,
  run: Type.Object({
    status: flowRunStatusSchema,
    trigger: flowRunTriggerSchema,
    nodes: Type.Array(flowRunNodeResultSchema),
    error: Type.Optional(Type.String()),
  }),
  nodeId: Type.Optional(Type.String({ minLength: 1 })),
});
export type ExplainRunRequest = Static<typeof explainRunRequestSchema>;

/** A message with the explanation and fix, or the same plus a proposed document when the fix is a config or wiring change. */
export const explainRunResponseSchema = generateFlowResponseSchema;
export type ExplainRunResponse = Static<typeof explainRunResponseSchema>;

export const explainRunContract = {
  method: "POST",
  path: "/ai/runs/explain",
  body: explainRunRequestSchema,
  response: { 200: explainRunResponseSchema, ...apiErrorResponses },
} as const;

export const redactedValue = "[redacted]";

const sensitiveKey =
  /(secret|token|password|passphrase|api[-_]?key|authorization|private[-_]?key|webhook)/i;
const secretPlaceholder = /\{\{\s*secrets\.[a-z][a-z0-9_]*\s*\}\}/g;
// Discord and Slack webhook URLs are credentials on their own.
const webhookUrl = /https?:\/\/[^\s"']*(?:webhooks?|hooks)\/[^\s"']+/gi;
// Bearer and key-shaped prefixes, and JWT-like `eyJ…` runs.
const bearerToken = /\b(?:Bearer|sk|xoxb|xoxp|ghp|pk)[-_ ][A-Za-z0-9._-]{16,}/g;
const jwtLike = /\beyJ[A-Za-z0-9._-]{20,}/g;
// Hex longer than a transaction hash (0x plus 64 digits) or a bare 64-digit run: a key, not
// an address or hash, which stay readable so an explanation can name them.
const longHex = /\b0x[0-9a-fA-F]{65,}\b|\b[0-9a-fA-F]{64,}\b/g;
// Long mixed-case runs with digits: API keys and base64 blobs; 0x-prefixed hex is left alone.
const longBase64 =
  /\b(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{40,}\b/g;

/** The text with secret placeholders, webhook URLs, tokens and long key-like strings replaced. */
export function redactSensitiveText(text: string): string {
  return text
    .replace(secretPlaceholder, redactedValue)
    .replace(webhookUrl, redactedValue)
    .replace(bearerToken, redactedValue)
    .replace(jwtLike, redactedValue)
    .replace(longHex, redactedValue)
    .replace(longBase64, (match) => (match.startsWith("0x") ? match : redactedValue));
}

/**
 * The value with every string redacted through `redactSensitiveText` and every field whose
 * key looks like a credential replaced outright. Arrays and objects are visited; the input
 * is not mutated.
 */
export function redactSensitiveValue(value: unknown): unknown {
  if (typeof value === "string") return redactSensitiveText(value);
  if (Array.isArray(value)) return value.map(redactSensitiveValue);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] =
        sensitiveKey.test(key) && entry !== undefined && entry !== null && entry !== ""
          ? redactedValue
          : redactSensitiveValue(entry);
    }
    return out;
  }
  return value;
}

/** The run's node outputs, errors and trigger payload with anything secret-looking redacted. */
export function redactRunOutputs<T extends ExplainRunRequest["run"]>(run: T): T {
  return {
    ...run,
    trigger: {
      ...run.trigger,
      ...(run.trigger.payload === undefined
        ? {}
        : { payload: redactSensitiveValue(run.trigger.payload) }),
    },
    ...(run.error === undefined ? {} : { error: redactSensitiveText(run.error) }),
    nodes: run.nodes.map((node) => ({
      ...node,
      ...(node.outputs === undefined
        ? {}
        : { outputs: redactSensitiveValue(node.outputs) as Record<string, unknown> }),
      ...(node.error === undefined ? {} : { error: redactSensitiveText(node.error) }),
    })),
  };
}
