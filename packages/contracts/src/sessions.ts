import { Type, type Static } from "@sinclair/typebox";
import { apiErrorResponses } from "./contract";

/**
 * A visitor's session in a published mini-app. The API runs the flow server-side and hands
 * the visitor only what the current screen needs; the document, its config and the run
 * results stay with the owner. `token` is issued once, on start, and must accompany every
 * answer; the session id alone opens nothing.
 */
export const miniAppScreenSchema = Type.Object({
  nodeId: Type.String({ minLength: 1 }),
  // Spelled out rather than mapped from `screenNodeTypes`, so Elysia infers the literals.
  type: Type.Union([
    Type.Literal("screen.page"),
    Type.Literal("screen.form"),
    Type.Literal("screen.confirmation"),
    Type.Literal("screen.qr-code"),
  ]),
  label: Type.String(),
  /** The screen's parsed config: titles, fields, labels. Never other nodes' config. */
  config: Type.Record(Type.String(), Type.Unknown()),
});
export type MiniAppScreen = Static<typeof miniAppScreenSchema>;

/** One non-screen node the last run worked through, for the interstitial. */
export const miniAppStepSchema = Type.Object({
  nodeId: Type.String({ minLength: 1 }),
  label: Type.String(),
  status: Type.Union([Type.Literal("succeeded"), Type.Literal("failed")]),
  error: Type.Optional(Type.String()),
});
export type MiniAppStep = Static<typeof miniAppStepSchema>;

export const miniAppSessionStatusSchema = Type.Union([
  Type.Literal("screen"),
  Type.Literal("end"),
  Type.Literal("failed"),
]);
export type MiniAppSessionStatus = Static<typeof miniAppSessionStatusSchema>;

export const miniAppSessionSchema = Type.Object({
  sessionId: Type.String({ minLength: 1 }),
  /** Present on the answer that started the session only. */
  token: Type.Optional(Type.String({ minLength: 1 })),
  status: miniAppSessionStatusSchema,
  screen: Type.Optional(miniAppScreenSchema),
  steps: Type.Array(miniAppStepSchema),
  /** Why the flow failed, in words a visitor can be shown; never node config. */
  error: Type.Optional(Type.String()),
});
export type MiniAppSession = Static<typeof miniAppSessionSchema>;

export const miniAppAnswerSchema = Type.Object(
  {
    token: Type.String({ minLength: 1 }),
    port: Type.String({ minLength: 1 }),
    /** A form's values keyed by field id; absent for a button. */
    data: Type.Optional(Type.Record(Type.String(), Type.String())),
  },
  { additionalProperties: false },
);
export type MiniAppAnswer = Static<typeof miniAppAnswerSchema>;

const flowParams = Type.Object({ id: Type.String({ minLength: 1 }) });
const sessionParams = Type.Object({
  id: Type.String({ minLength: 1 }),
  sessionId: Type.String({ minLength: 1 }),
});

/** Opens a session on a published flow: runs it from its mini-app trigger to the first screen. */
export const startMiniAppSessionContract = {
  method: "POST",
  path: "/public/flows/:id/sessions",
  params: flowParams,
  response: { 201: miniAppSessionSchema, ...apiErrorResponses },
} as const;
/** Answers the current screen and runs on to the next one, the end, or a failure. */
export const answerMiniAppSessionContract = {
  method: "POST",
  path: "/public/flows/:id/sessions/:sessionId/answer",
  params: sessionParams,
  body: miniAppAnswerSchema,
  response: { 200: miniAppSessionSchema, ...apiErrorResponses },
} as const;
