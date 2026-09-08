import { Type, type Static } from "@sinclair/typebox";
import { apiErrorResponses } from "./contract";
import { flowRunNodeResultSchema, flowRunStatusSchema, flowRunTriggerSchema } from "./flow-runs";
import { flowDocumentInputSchema } from "./flows";

/** Two model attempts, provider fallback and bounded local checks share this client budget. */
export const aiRequestTimeoutMs = 300_000;

export const aiHistoryLimit = 40;

export const aiHistoryTurnSchema = Type.Object({
  role: Type.Union([Type.Literal("user"), Type.Literal("assistant")]),
  text: Type.String({ maxLength: 4000 }),
});
export type AiHistoryTurn = Static<typeof aiHistoryTurnSchema>;

export const generateFlowRequestSchema = Type.Object({
  prompt: Type.String({ minLength: 1, maxLength: 4000 }),
  document: Type.Optional(flowDocumentInputSchema),
  history: Type.Optional(Type.Array(aiHistoryTurnSchema, { maxItems: aiHistoryLimit })),
});
export type GenerateFlowRequest = Static<typeof generateFlowRequestSchema>;

export const aiFlowTestSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 120 }),
  triggerNodeId: Type.Optional(Type.String()),
  payload: Type.Optional(Type.Unknown()),
  answers: Type.Optional(
    Type.Record(
      Type.String(),
      Type.Object({
        port: Type.String(),
        data: Type.Optional(Type.Record(Type.String(), Type.String())),
      }),
    ),
  ),
  expect: Type.Array(
    Type.Object({
      nodeId: Type.String(),
      output: Type.Optional(Type.String()),
      path: Type.Optional(Type.String()),
      equals: Type.Optional(Type.Unknown()),
      screenBody: Type.Optional(Type.String()),
    }),
    { minItems: 1, maxItems: 12 },
  ),
});
export type AiFlowTest = Static<typeof aiFlowTestSchema>;

export const aiVerificationSchema = Type.Object({
  checks: Type.Array(
    Type.Object({
      name: Type.String(),
      status: Type.Union([Type.Literal("passed"), Type.Literal("skipped")]),
      detail: Type.String(),
    }),
    { maxItems: 8 },
  ),
  warnings: Type.Array(Type.String(), { maxItems: 20 }),
});
export type AiVerification = Static<typeof aiVerificationSchema>;

export const aiFlowAnswerSchema = Type.Object({
  kind: Type.Literal("flow"),
  document: flowDocumentInputSchema,
  summary: Type.String(),
  verification: Type.Optional(aiVerificationSchema),
});
export type AiFlowAnswer = Static<typeof aiFlowAnswerSchema>;

export const aiMessageAnswerSchema = Type.Object({
  kind: Type.Literal("message"),
  text: Type.String(),
});
export type AiMessageAnswer = Static<typeof aiMessageAnswerSchema>;

export const generateFlowResponseSchema = Type.Union([aiFlowAnswerSchema, aiMessageAnswerSchema]);
export type GenerateFlowResponse = Static<typeof generateFlowResponseSchema>;

export const generateFlowContract = {
  method: "POST",
  path: "/ai/flows",
  body: generateFlowRequestSchema,
  response: { 200: generateFlowResponseSchema, ...apiErrorResponses },
} as const;

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

export function redactSensitiveText(text: string): string {
  return text
    .replace(secretPlaceholder, redactedValue)
    .replace(webhookUrl, redactedValue)
    .replace(bearerToken, redactedValue)
    .replace(jwtLike, redactedValue)
    .replace(longHex, redactedValue)
    .replace(longBase64, (match) => (match.startsWith("0x") ? match : redactedValue));
}

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
