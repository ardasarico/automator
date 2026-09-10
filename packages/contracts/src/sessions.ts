import { Type, type Static } from "@sinclair/typebox";
import { apiErrorResponses } from "./contract";
import type { FlowNodeType } from "./flows";
import { worldProofSchema, worldRequestSchema } from "./identity";
import { isSignerNodeType } from "./signer-nodes";

/*
 * The payment a `usdc.payment` screen asks the visitor to make, resolved by the API: the chain's
 * USDC, the recipient the flow settled on, and the exact base units to transfer. The browser signs
 * these numbers rather than deriving them, so what the visitor pays is what the API verifies.
 */
export const miniAppPaymentSchema = Type.Object({
  chainId: Type.Number(),
  chainName: Type.String(),
  token: Type.String({ minLength: 1 }),
  decimals: Type.Number(),
  to: Type.String({ minLength: 1 }),
  /** The amount in dollars, for display only. */
  amount: Type.String(),
  /** The amount in the token's base units, as a decimal string. */
  amountUnits: Type.String({ minLength: 1 }),
});
export type MiniAppPayment = Static<typeof miniAppPaymentSchema>;

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
    Type.Literal("usdc.payment"),
  ]),
  label: Type.String(),
  config: Type.Record(Type.String(), Type.Unknown()),
  world: Type.Optional(worldRequestSchema),
  payment: Type.Optional(miniAppPaymentSchema),
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
/** For a signer node the owner has not set up: the one case a visitor can act on by coming back later. */
export const miniAppFundsFailureMessage =
  "This app can't send funds right now. Its owner has to finish setting it up first.";
/** The same, for the screen that collects a payment: the visitor's money never moved. */
export const miniAppPaymentFailureMessage =
  "This app can't take payments right now. Its owner has to finish setting it up first.";

/** How a failed run reads to the runtime, classified from the engine's error text. */
export function failureCode(error: string | undefined): MiniAppFailureCode {
  if (!error) return "node_failed";
  if (error === "The run was cancelled.") return "cancelled";
  if (/timed out|timeout/i.test(error)) return "timeout";
  if (
    /is not configured|is not defined|is not enabled|has no wallet|^No .+ is configured/i.test(
      error,
    )
  )
    return "unconfigured";
  return "node_failed";
}

/**
 * The sentence a visitor sees for a failed run. Never the node's own error: that can name
 * URLs, addresses, revert data, secret names or the owner's setup, and the stored run keeps it
 * for the owner. A signer node that is not set up gets the funds sentence; anything else the
 * generic one.
 */
export function visitorFailureMessage(
  code: MiniAppFailureCode,
  nodeType: FlowNodeType | undefined,
): string {
  if (code !== "unconfigured" || nodeType === undefined) return miniAppFailureMessage;
  if (nodeType === "usdc.payment") return miniAppPaymentFailureMessage;
  return isSignerNodeType(nodeType) ? miniAppFundsFailureMessage : miniAppFailureMessage;
}

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
