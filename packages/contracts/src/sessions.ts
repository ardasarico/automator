import { Type, type Static } from "@sinclair/typebox";
import { apiErrorResponses } from "./contract";
import { worldProofSchema, worldRequestSchema } from "./identity";

export const miniAppScreenSchema = Type.Object({
  nodeId: Type.String({ minLength: 1 }),
  // Spelled out rather than mapped from `screenNodeTypes`, so Elysia infers the literals.
  type: Type.Union([
    Type.Literal("screen.page"),
    Type.Literal("screen.form"),
    Type.Literal("screen.confirmation"),
    Type.Literal("screen.qr-code"),
    Type.Literal("privy.login"),
    Type.Literal("world.id-verify"),
    Type.Literal("world.selfie-check"),
  ]),
  label: Type.String(),
  config: Type.Record(Type.String(), Type.Unknown()),
  world: Type.Optional(worldRequestSchema),
});
export type MiniAppScreen = Static<typeof miniAppScreenSchema>;

export const miniAppStepSchema = Type.Object({
  nodeId: Type.String({ minLength: 1 }),
  label: Type.String(),
  status: Type.Union([Type.Literal("succeeded"), Type.Literal("failed")]),
});
export type MiniAppStep = Static<typeof miniAppStepSchema>;

export const miniAppSessionStatusSchema = Type.Union([
  Type.Literal("screen"),
  Type.Literal("end"),
  Type.Literal("failed"),
]);
export type MiniAppSessionStatus = Static<typeof miniAppSessionStatusSchema>;

export const miniAppFailureCodeSchema = Type.Union([
  Type.Literal("node_failed"),
  Type.Literal("unconfigured"),
  Type.Literal("cancelled"),
  Type.Literal("timeout"),
]);
export type MiniAppFailureCode = Static<typeof miniAppFailureCodeSchema>;

export const miniAppFailureMessage = "This app hit a problem and could not continue.";

export const miniAppSessionSchema = Type.Object({
  sessionId: Type.String({ minLength: 1 }),
  token: Type.Optional(Type.String({ minLength: 1 })),
  status: miniAppSessionStatusSchema,
  screen: Type.Optional(miniAppScreenSchema),
  steps: Type.Array(miniAppStepSchema),
  error: Type.Optional(Type.String()),
  code: Type.Optional(miniAppFailureCodeSchema),
  help: Type.Optional(Type.String()),
});
export type MiniAppSession = Static<typeof miniAppSessionSchema>;

export const miniAppAnswerSchema = Type.Object(
  {
    token: Type.String({ minLength: 1 }),
    nodeId: Type.String({ minLength: 1 }),
    port: Type.String({ minLength: 1 }),
    data: Type.Optional(Type.Record(Type.String(), Type.String())),
    privyToken: Type.Optional(Type.String({ minLength: 1 })),
    worldProof: Type.Optional(worldProofSchema),
  },
  { additionalProperties: false },
);
export type MiniAppAnswer = Static<typeof miniAppAnswerSchema>;

const flowParams = Type.Object({ id: Type.String({ minLength: 1 }) });
const sessionParams = Type.Object({
  id: Type.String({ minLength: 1 }),
  sessionId: Type.String({ minLength: 1 }),
});

export const startMiniAppSessionContract = {
  method: "POST",
  path: "/public/flows/:id/sessions",
  params: flowParams,
  response: { 201: miniAppSessionSchema, ...apiErrorResponses },
} as const;
export const answerMiniAppSessionContract = {
  method: "POST",
  path: "/public/flows/:id/sessions/:sessionId/answer",
  params: sessionParams,
  body: miniAppAnswerSchema,
  response: { 200: miniAppSessionSchema, ...apiErrorResponses },
} as const;
