import { Type, type Static } from "@sinclair/typebox";
import { Check } from "@sinclair/typebox/value";
import { chainIdSchema, defaultChainId, type ChainId } from "./chains";
import { flowRunStatusSchema } from "./run-status";
import { apiErrorResponses } from "./contract";

export const flowNodeTypes = [
  "trigger.schedule",
  "trigger.onchain-event",
  "trigger.price",
  "trigger.balance",
  "trigger.webhook",
  "trigger.miniapp-open",
  "trigger.manual",
  "logic.condition",
  "logic.switch",
  "logic.wait",
  "logic.for-each",
  "logic.merge",
  "logic.filter",
  "logic.set-variable",
  "logic.run-code",
  "onchain.read-contract",
  "onchain.write-contract",
  "onchain.transfer-token",
  "onchain.sign-message",
  "ai.agent",
  "ai.classify",
  "ai.extract",
  "ai.generate-text",
  "screen.page",
  "screen.form",
  "screen.confirmation",
  "screen.qr-code",
  "notify.telegram",
  "notify.email",
  "notify.discord",
  "world.id-verify",
  "world.verification-completed",
  "privy.wallet",
  "privy.login",
  "privy.sign-transaction",
  "usdc.payment",
  "usdc.payout",
  "usdc.balance",
  "data.create-record",
  "data.find-records",
  "data.update-record",
  "data.delete-record",
] as const;
export type FlowNodeType = (typeof flowNodeTypes)[number];

/* Unsafe preserves the literal union that mapping to Type.Union would widen. */
export const flowNodeTypeSchema = Type.Unsafe<FlowNodeType>(
  Type.Union(flowNodeTypes.map((type) => Type.Literal(type))),
);

/**
 * A trigger written as a sentence fragment, so a list can say what starts a flow
 * ("DCA into ETH runs every 1h") without opening the flow document.
 */
export const flowTriggerSummarySchema = Type.Object({
  nodeId: Type.String({ minLength: 1 }),
  type: flowNodeTypeSchema,
  summary: Type.String(),
});
export type FlowTriggerSummary = Static<typeof flowTriggerSummarySchema>;

/**
 * The flow's shape, as a list can draw it: the node positions and the wires between them,
 * without the configuration a document carries. Enough for a miniature, cheap to send.
 */
export const flowOutlineSchema = Type.Object({
  nodes: Type.Array(
    Type.Object({
      id: Type.String({ minLength: 1 }),
      type: flowNodeTypeSchema,
      x: Type.Number(),
      y: Type.Number(),
    }),
  ),
  edges: Type.Array(
    Type.Object({ source: Type.String({ minLength: 1 }), target: Type.String({ minLength: 1 }) }),
  ),
});
export type FlowOutline = Static<typeof flowOutlineSchema>;

/** How the flow last ended, so a list can say it without opening the runs. */
export const flowLastRunSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  status: flowRunStatusSchema,
  startedAt: Type.String(),
});
export type FlowLastRun = Static<typeof flowLastRunSchema>;

export const flowSummarySchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  name: Type.String(),
  description: Type.String(),
  updatedAt: Type.String(),
  enabled: Type.Boolean(),
  triggerTypes: Type.Array(flowNodeTypeSchema),
  /* The same triggers written as sentence fragments, for lists that say what starts a flow. */
  triggers: Type.Array(flowTriggerSummarySchema),
  nodeCount: Type.Integer({ minimum: 0 }),
  outline: flowOutlineSchema,
  /* Absent until the flow has run once. */
  lastRun: Type.Optional(flowLastRunSchema),
});
export type FlowSummary = Static<typeof flowSummarySchema>;

export const flowPositionSchema = Type.Object({ x: Type.Number(), y: Type.Number() });

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

export const flowDocumentSchema = Type.Object({
  version: Type.Literal(1),
  id: Type.String({ minLength: 1 }),
  name: Type.String(),
  description: Type.String(),
  chainId: Type.Optional(chainIdSchema),
  nodes: Type.Array(flowNodeSchema),
  edges: Type.Array(flowEdgeSchema),
});
export type FlowDocument = Static<typeof flowDocumentSchema>;

/** The outline a list carries, taken from a full document. */
export function documentOutline(document: Pick<FlowDocument, "nodes" | "edges">): FlowOutline {
  return {
    nodes: document.nodes.map(({ id, type, position }) => ({
      id,
      type,
      x: position.x,
      y: position.y,
    })),
    edges: document.edges.map(({ source, target }) => ({ source, target })),
  };
}

export function flowChainId(document: Pick<FlowDocument, "chainId">): ChainId {
  return document.chainId ?? defaultChainId;
}

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

export const flowRecordSchema = Type.Object({
  flow: flowDocumentSchema,
  createdAt: Type.String(),
  updatedAt: Type.String(),
  enabled: Type.Optional(Type.Boolean()),
  appPublished: Type.Optional(Type.Boolean()),
  webhookToken: Type.Optional(Type.String({ minLength: 1 })),
});
export type FlowRecord = Static<typeof flowRecordSchema>;

export const flowPatchSchema = Type.Object(
  { enabled: Type.Optional(Type.Boolean()), appPublished: Type.Optional(Type.Boolean()) },
  { additionalProperties: false },
);
export type FlowPatch = Static<typeof flowPatchSchema>;
/* An empty patch would answer 200 without changing anything, so it is rejected as invalid. */
export function isFlowPatch(body: unknown): body is FlowPatch {
  return (
    Check(flowPatchSchema, body) && (body.enabled !== undefined || body.appPublished !== undefined)
  );
}

export function isFlowDocumentInput(body: unknown): body is FlowDocumentInput {
  return Check(flowDocumentInputSchema, body);
}

export function isFlowDocument(value: unknown): value is FlowDocument {
  return Check(flowDocumentSchema, value);
}

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
export const updateFlowContract = {
  method: "PUT",
  path: "/flows/:id",
  params: flowParamsSchema,
  body: flowDocumentInputSchema,
  response: { 200: flowRecordSchema, ...apiErrorResponses },
} as const;

export const patchFlowContract = {
  method: "PATCH",
  path: "/flows/:id",
  params: flowParamsSchema,
  body: flowPatchSchema,
  response: { 200: flowRecordSchema, ...apiErrorResponses },
} as const;
export const deleteFlowContract = {
  method: "DELETE",
  path: "/flows/:id",
  params: flowParamsSchema,
  response: { 200: Type.Object({ id: Type.String({ minLength: 1 }) }), ...apiErrorResponses },
} as const;

export type ListFlowsResponse = Static<(typeof listFlowsContract.response)[200]>;
