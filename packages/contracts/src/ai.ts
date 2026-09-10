import { Type, type Static } from "@sinclair/typebox";
import { apiErrorCodeSchema } from "./contract";
import { flowProblemSchema } from "./flow-problems";
import { flowRunNodeResultSchema, flowRunStatusSchema, flowRunTriggerSchema } from "./flow-runs";
import { flowDocumentInputSchema } from "./flows";

/** One agent turn: model hops, tool calls, checks and one repair share this client budget. */
export const aiRequestTimeoutMs = 300_000;

export const aiMessageTextMaxLength = 4000;

/* ---- Verification (unchanged shapes) ---- */

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
      status: Type.Union([Type.Literal("passed"), Type.Literal("failed"), Type.Literal("skipped")]),
      detail: Type.String(),
    }),
    { maxItems: 8 },
  ),
  warnings: Type.Array(Type.String(), { maxItems: 20 }),
});
export type AiVerification = Static<typeof aiVerificationSchema>;

/* ---- Errors ---- */

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

/* ---- Context the panel sends with a message ---- */

export const aiRunContextSchema = Type.Object({
  status: flowRunStatusSchema,
  trigger: flowRunTriggerSchema,
  nodes: Type.Array(flowRunNodeResultSchema),
  error: Type.Optional(Type.String()),
  /** The node to explain; else the first failed node, else the run-wide error. */
  nodeId: Type.Optional(Type.String({ minLength: 1 })),
});
export type AiRunContext = Static<typeof aiRunContextSchema>;

export const aiContextSchema = Type.Object({
  selection: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { maxItems: 50 })),
  problems: Type.Optional(Type.Array(flowProblemSchema, { maxItems: 50 })),
  run: Type.Optional(aiRunContextSchema),
});
export type AiContext = Static<typeof aiContextSchema>;

/* ---- Messages and their parts ---- */

export const aiProposalStateSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("applied"),
  Type.Literal("discarded"),
  Type.Literal("stale"),
]);
export type AiProposalState = Static<typeof aiProposalStateSchema>;

export const aiStatusPhaseSchema = Type.Union([
  Type.Literal("thinking"),
  Type.Literal("checking"),
  Type.Literal("repairing"),
]);
export type AiStatusPhase = Static<typeof aiStatusPhaseSchema>;

const textPart = Type.Object({ type: Type.Literal("text"), text: Type.String() });
const toolPart = Type.Object({
  type: Type.Literal("tool"),
  id: Type.String(),
  name: Type.String(),
  args: Type.Record(Type.String(), Type.Unknown()),
  /* Absent while the call is still running. */
  ok: Type.Optional(Type.Boolean()),
  detail: Type.Optional(Type.String()),
});
const questionPart = Type.Object({
  type: Type.Literal("question"),
  text: Type.String(),
  options: Type.Array(Type.String(), { maxItems: 4 }),
});
const proposalPart = Type.Object({
  type: Type.Literal("proposal"),
  document: flowDocumentInputSchema,
  verification: aiVerificationSchema,
  /* A new flow replaces the canvas; an edit keeps the canvas's secrets for nodes it kept. */
  replaces: Type.Boolean(),
  state: aiProposalStateSchema,
});
const suggestionsPart = Type.Object({
  type: Type.Literal("suggestions"),
  items: Type.Array(Type.String(), { maxItems: 3 }),
});
const errorPart = Type.Object({
  type: Type.Literal("error"),
  error: apiErrorCodeSchema,
  detail: Type.Optional(Type.String({ maxLength: aiErrorDetailMaxLength })),
});

export const aiPartSchema = Type.Union([
  textPart,
  toolPart,
  questionPart,
  proposalPart,
  suggestionsPart,
  errorPart,
]);
export type AiPart = Static<typeof aiPartSchema>;
export type AiProposalPart = Static<typeof proposalPart>;
export type AiToolPart = Static<typeof toolPart>;

export const aiMessageSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  role: Type.Union([Type.Literal("user"), Type.Literal("assistant")]),
  parts: Type.Array(aiPartSchema),
  context: Type.Optional(aiContextSchema),
  createdAt: Type.String(),
});
export type AiMessage = Static<typeof aiMessageSchema>;

/* ---- Stream events ---- */

export const aiStreamEventSchema = Type.Union([
  Type.Object({ type: Type.Literal("message"), id: Type.String({ minLength: 1 }) }),
  Type.Object({ type: Type.Literal("text.delta"), delta: Type.String() }),
  Type.Object({
    type: Type.Literal("tool.call"),
    id: Type.String(),
    name: Type.String(),
    args: Type.Record(Type.String(), Type.Unknown()),
  }),
  Type.Object({
    type: Type.Literal("tool.result"),
    id: Type.String(),
    ok: Type.Boolean(),
    detail: Type.String(),
    /* The working copy after a successful mutation, laid out, for the canvas preview. */
    document: Type.Optional(flowDocumentInputSchema),
  }),
  Type.Object({
    type: Type.Literal("status"),
    phase: aiStatusPhaseSchema,
    detail: Type.Optional(Type.String()),
  }),
  Type.Object({
    type: Type.Literal("question"),
    text: Type.String(),
    options: Type.Array(Type.String(), { maxItems: 4 }),
  }),
  Type.Object({
    type: Type.Literal("proposal"),
    document: flowDocumentInputSchema,
    verification: aiVerificationSchema,
    replaces: Type.Boolean(),
  }),
  Type.Object({
    type: Type.Literal("suggestions"),
    items: Type.Array(Type.String(), { maxItems: 3 }),
  }),
  Type.Object({
    type: Type.Literal("error"),
    error: apiErrorCodeSchema,
    detail: Type.Optional(Type.String({ maxLength: aiErrorDetailMaxLength })),
  }),
  Type.Object({ type: Type.Literal("done") }),
]);
export type AiStreamEvent = Static<typeof aiStreamEventSchema>;

/* ---- Routes ---- */

const flowParams = Type.Object({ id: Type.String({ minLength: 1 }) });
const messageParams = Type.Object({
  id: Type.String({ minLength: 1 }),
  messageId: Type.String({ minLength: 1 }),
});

export const listAiMessagesContract = {
  method: "GET",
  path: "/flows/:id/ai/messages",
  params: flowParams,
  response: { 200: Type.Object({ messages: Type.Array(aiMessageSchema) }), ...aiErrorResponses },
} as const;

export const sendAiMessageRequestSchema = Type.Object({
  text: Type.String({ minLength: 1, maxLength: aiMessageTextMaxLength }),
  /* The canvas when it has unsaved changes; absent, the API reads the saved flow. */
  document: Type.Optional(flowDocumentInputSchema),
  context: Type.Optional(aiContextSchema),
});
export type SendAiMessageRequest = Static<typeof sendAiMessageRequestSchema>;

/** Answers `text/event-stream` of `aiStreamEventSchema`; the 200 body is not JSON. */
export const sendAiMessageContract = {
  method: "POST",
  path: "/flows/:id/ai/messages",
  params: flowParams,
  body: sendAiMessageRequestSchema,
  response: { 200: Type.Unknown(), ...aiErrorResponses },
} as const;

export const setAiProposalStateContract = {
  method: "PATCH",
  path: "/flows/:id/ai/messages/:messageId",
  params: messageParams,
  body: Type.Object({
    state: Type.Union([Type.Literal("applied"), Type.Literal("discarded")]),
  }),
  response: { 200: Type.Object({ message: aiMessageSchema }), ...aiErrorResponses },
} as const;

export const clearAiMessagesContract = {
  method: "DELETE",
  path: "/flows/:id/ai/messages",
  params: flowParams,
  response: { 200: Type.Object({ cleared: Type.Boolean() }), ...aiErrorResponses },
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

export function redactRunOutputs<T extends Pick<AiRunContext, "trigger" | "error" | "nodes">>(
  run: T,
): T {
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
    ? `${text.slice(0, aiErrorDetailMaxLength - 1).trimEnd()}…`
    : text;
}
