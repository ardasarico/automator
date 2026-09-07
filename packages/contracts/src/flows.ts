import { Type, type Static } from "@sinclair/typebox";

/**
 * A flow as it appears in a list. `updatedAt` is an ISO-8601 timestamp.
 */
export const flowSummarySchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  name: Type.String(),
  description: Type.String(),
  updatedAt: Type.String(),
});
export type FlowSummary = Static<typeof flowSummarySchema>;

/**
 * Node type ids known to the builder. The contract owns only the ids; icons, labels,
 * handle counts and copy live in the web catalog so this file stays backend independent.
 * Ids are namespaced by category: `trigger`, `integration`, `ai`, `screen`.
 */
export const flowNodeTypes = [
  // Generic triggers
  "trigger.schedule",
  "trigger.onchain-event",
  "trigger.webhook",
  "trigger.miniapp-open",
  "trigger.manual",
  // Logic
  "logic.condition",
  "logic.switch",
  "logic.wait",
  "logic.for-each",
  "logic.merge",
  "logic.filter",
  "logic.set-variable",
  "logic.run-code",
  // Onchain
  "onchain.read-contract",
  "onchain.write-contract",
  "onchain.transfer-token",
  "onchain.sign-message",
  // AI
  "ai.agent",
  "ai.classify",
  "ai.extract",
  "ai.generate-text",
  // Screens
  "screen.page",
  "screen.form",
  "screen.confirmation",
  "screen.qr-code",
  // Notifications
  "notify.telegram",
  "notify.email",
  "notify.discord",
  // Integrations, prefixed by provider
  "world.selfie-check",
  "world.id-verify",
  "world.verification-completed",
  "privy.wallet",
  "privy.login",
  "privy.sign-transaction",
  "usdc.payment",
  "usdc.payout",
  "usdc.balance",
] as const;
export type FlowNodeType = (typeof flowNodeTypes)[number];

export const flowNodeTypeSchema = Type.Union(flowNodeTypes.map((type) => Type.Literal(type)));

export const flowPositionSchema = Type.Object({ x: Type.Number(), y: Type.Number() });

/** `config` is per-type settings; every type accepts an empty object until it defines a schema. */
export const flowNodeSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  type: flowNodeTypeSchema,
  position: flowPositionSchema,
  label: Type.String(),
  config: Type.Record(Type.String(), Type.Unknown()),
});
export type FlowNode = Static<typeof flowNodeSchema>;

export const flowEdgeSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  source: Type.String({ minLength: 1 }),
  target: Type.String({ minLength: 1 }),
  sourceHandle: Type.Optional(Type.String()),
  targetHandle: Type.Optional(Type.String()),
});
export type FlowEdge = Static<typeof flowEdgeSchema>;

/**
 * The builder's full flow document: what the canvas edits and what the API will store.
 * `version` is the document schema version; bump it when a migration is needed.
 * The schema is structural only; referential checks (edges pointing at existing nodes)
 * belong to whoever mutates the document.
 */
export const flowDocumentSchema = Type.Object({
  version: Type.Literal(1),
  id: Type.String({ minLength: 1 }),
  name: Type.String(),
  description: Type.String(),
  nodes: Type.Array(flowNodeSchema),
  edges: Type.Array(flowEdgeSchema),
});
export type FlowDocument = Static<typeof flowDocumentSchema>;
