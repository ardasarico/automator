import { Type, type Static } from "@sinclair/typebox";
import { apiErrorCodeSchema } from "./contract";
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

/**
 * One assertion about a run. `nodeId` alone asserts the node was reached; naming an `output`
 * (with an optional `path` into it) asserts a value was produced there, and a comparison
 * narrows that to a concrete claim. Several comparisons on one expectation all have to hold.
 */
export const aiFlowExpectationSchema = Type.Object({
  nodeId: Type.String(),
  output: Type.Optional(Type.String()),
  path: Type.Optional(Type.String()),
  equals: Type.Optional(Type.Unknown()),
  greaterThan: Type.Optional(Type.Number()),
  lessThan: Type.Optional(Type.Number()),
  contains: Type.Optional(Type.String()),
  screenBody: Type.Optional(Type.String()),
});
export type AiFlowExpectation = Static<typeof aiFlowExpectationSchema>;

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
  expect: Type.Array(aiFlowExpectationSchema, { minItems: 1, maxItems: 12 }),
});
export type AiFlowTest = Static<typeof aiFlowTestSchema>;

export const aiVerificationSchema = Type.Object({
  checks: Type.Array(
    Type.Object({
      name: Type.String(),
      /* passed: asserted and true. failed: asserted and false — a real problem in the flow.
         skipped: not exercised, which asserts nothing either way. */
      status: Type.Union([Type.Literal("passed"), Type.Literal("failed"), Type.Literal("skipped")]),
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

/**
 * AI failures keep the stable `error` code for programmatic handling and add a short,
 * human-readable `detail` so the panel can say what actually went wrong instead of
 * "the model could not produce a valid flow". Build it with `aiErrorDetail`, never from a
 * raw upstream payload.
 */
export const aiErrorDetailMaxLength = 300;

export const aiErrorSchema = Type.Object({
  error: apiErrorCodeSchema,
  detail: Type.Optional(Type.String({ maxLength: aiErrorDetailMaxLength })),
});
export type AiError = Static<typeof aiErrorSchema>;

const aiErrorResponses = {
  400: aiErrorSchema,
  401: aiErrorSchema,
  403: aiErrorSchema,
  404: aiErrorSchema,
  409: aiErrorSchema,
  422: aiErrorSchema,
  429: aiErrorSchema,
  500: aiErrorSchema,
  503: aiErrorSchema,
} as const;

export const generateFlowContract = {
  method: "POST",
  path: "/ai/flows",
  body: generateFlowRequestSchema,
  response: { 200: generateFlowResponseSchema, ...aiErrorResponses },
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
  response: { 200: explainRunResponseSchema, ...aiErrorResponses },
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

/**
 * Turns an internal failure message into a detail safe to show the user: secrets redacted,
 * whitespace collapsed to one line and the length bounded. Returns undefined when nothing
 * useful is left, so the caller falls back to the generic wording for the code.
 */
export function aiErrorDetail(message: string): string | undefined {
  const text = redactSensitiveText(message).replace(/\s+/g, " ").trim();
  if (text === "") return undefined;
  return text.length > aiErrorDetailMaxLength
    ? `${text.slice(0, aiErrorDetailMaxLength - 1).trimEnd()}\u2026`
    : text;
}
