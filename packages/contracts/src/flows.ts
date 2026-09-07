import { Type, type Static } from "@sinclair/typebox";
import { Check } from "@sinclair/typebox/value";
import { chainIdSchema, defaultChainId, type ChainId } from "./chains";
import { apiErrorResponses } from "./contract";

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

/**
 * The literal union is built from the list, which types as an array rather than a tuple;
 * `Unsafe` pins the static type so consumers (Elysia's response typing included) see the ids.
 */
export const flowNodeTypeSchema = Type.Unsafe<FlowNodeType>(
  Type.Union(flowNodeTypes.map((type) => Type.Literal(type))),
);

/**
 * A flow as it appears in a list. `updatedAt` is an ISO-8601 timestamp; `enabled` says whether
 * its webhook and schedule triggers are live; `triggerTypes` lists the distinct trigger node
 * types in the document (`trigger.*` and provider triggers) and `nodeCount` the node total.
 */
export const flowSummarySchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  name: Type.String(),
  description: Type.String(),
  updatedAt: Type.String(),
  enabled: Type.Boolean(),
  triggerTypes: Type.Array(flowNodeTypeSchema),
  nodeCount: Type.Integer({ minimum: 0 }),
});
export type FlowSummary = Static<typeof flowSummarySchema>;

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
  /** The registry chain onchain nodes run on; absent means `defaultChainId` (older documents). */
  chainId: Type.Optional(chainIdSchema),
  nodes: Type.Array(flowNodeSchema),
  edges: Type.Array(flowEdgeSchema),
});
export type FlowDocument = Static<typeof flowDocumentSchema>;

/** The chain a document runs on, Base Sepolia when it names none. */
export function flowChainId(document: Pick<FlowDocument, "chainId">): ChainId {
  return document.chainId ?? defaultChainId;
}

/**
 * What a client sends to create or save a flow: the document without its id, which the
 * API mints and keeps. The name must have a visible character; a client that wants a default
 * sends `"Untitled flow"` itself.
 */
export const flowDocumentInputSchema = Type.Object(
  {
    version: Type.Literal(1),
    name: Type.String({ minLength: 1, maxLength: 120, pattern: "\\S" }),
    description: Type.String({ maxLength: 1000 }),
    chainId: Type.Optional(chainIdSchema),
    nodes: Type.Array(flowNodeSchema),
    edges: Type.Array(flowEdgeSchema),
  },
  { additionalProperties: false },
);
export type FlowDocumentInput = Static<typeof flowDocumentInputSchema>;

/**
 * A stored flow: its document plus the server-side timestamps (ISO-8601). Owner-facing reads
 * also carry `enabled` (whether its triggers are live) and `webhookToken` (the secret path
 * segment of its webhook URL); the public read and copies leave them out.
 */
export const flowRecordSchema = Type.Object({
  flow: flowDocumentSchema,
  createdAt: Type.String(),
  updatedAt: Type.String(),
  enabled: Type.Optional(Type.Boolean()),
  webhookToken: Type.Optional(Type.String({ minLength: 1 })),
});
export type FlowRecord = Static<typeof flowRecordSchema>;

/** Settings that live beside the document and change without a save: only activation so far. */
export const flowPatchSchema = Type.Object(
  { enabled: Type.Boolean() },
  { additionalProperties: false },
);
export type FlowPatch = Static<typeof flowPatchSchema>;
export function isFlowPatch(body: unknown): body is FlowPatch {
  return Check(flowPatchSchema, body);
}

export function isFlowDocumentInput(body: unknown): body is FlowDocumentInput {
  return Check(flowDocumentInputSchema, body);
}

/**
 * Structural validation stops at the schema; this checks the references: node ids unique,
 * edge ids unique, every edge joining two existing, distinct nodes. Returns the reason the
 * document is unusable, or `null` when it is consistent.
 */
export function findFlowDocumentProblem(
  document: Pick<FlowDocumentInput, "nodes" | "edges">,
): string | null {
  const nodeIds = new Set<string>();
  for (const node of document.nodes) {
    if (nodeIds.has(node.id)) return `Duplicate node id "${node.id}"`;
    nodeIds.add(node.id);
  }
  const edgeIds = new Set<string>();
  for (const edge of document.edges) {
    if (edgeIds.has(edge.id)) return `Duplicate edge id "${edge.id}"`;
    edgeIds.add(edge.id);
    if (edge.source === edge.target) return `Edge "${edge.id}" loops on "${edge.source}"`;
    if (!nodeIds.has(edge.source)) return `Edge "${edge.id}" starts at unknown node`;
    if (!nodeIds.has(edge.target)) return `Edge "${edge.id}" ends at unknown node`;
  }
  return null;
}

const flowParamsSchema = Type.Object({ id: Type.String({ minLength: 1 }) });

/** The caller's flows, newest edit first. */
export const listFlowsContract = {
  method: "GET",
  path: "/flows",
  response: { 200: Type.Object({ flows: Type.Array(flowSummarySchema) }), ...apiErrorResponses },
} as const;
export const createFlowContract = {
  method: "POST",
  path: "/flows",
  body: flowDocumentInputSchema,
  response: { 201: flowRecordSchema, ...apiErrorResponses },
} as const;
export const getFlowContract = {
  method: "GET",
  path: "/flows/:id",
  params: flowParamsSchema,
  response: { 200: flowRecordSchema, ...apiErrorResponses },
} as const;
/** Replaces the whole document; the id in the path wins over anything in the body. */
export const updateFlowContract = {
  method: "PUT",
  path: "/flows/:id",
  params: flowParamsSchema,
  body: flowDocumentInputSchema,
  response: { 200: flowRecordSchema, ...apiErrorResponses },
} as const;

/** Turns the flow's triggers on or off; answers the record like a read. */
export const patchFlowContract = {
  method: "PATCH",
  path: "/flows/:id",
  params: flowParamsSchema,
  body: flowPatchSchema,
  response: { 200: flowRecordSchema, ...apiErrorResponses },
} as const;
/** Removes the flow with its listing and runs; answers the id so the client can drop it. */
export const deleteFlowContract = {
  method: "DELETE",
  path: "/flows/:id",
  params: flowParamsSchema,
  response: { 200: Type.Object({ id: Type.String({ minLength: 1 }) }), ...apiErrorResponses },
} as const;

export type ListFlowsResponse = Static<(typeof listFlowsContract.response)[200]>;
