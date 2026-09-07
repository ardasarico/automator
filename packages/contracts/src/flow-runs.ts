import { Type, type Static } from "@sinclair/typebox";
import { apiErrorResponses } from "./contract";
import { flowDocumentSchema } from "./flows";

/**
 * One node's outcome in a run. `skipped` nodes never ran because no incoming edge fired or
 * an earlier node failed; a `waiting` node is a visitor-facing pause the run stopped at.
 * Timestamps are ISO-8601; `outputs` is keyed by output handle id.
 */
export const flowRunNodeStatusSchema = Type.Union([
  Type.Literal("succeeded"),
  Type.Literal("failed"),
  Type.Literal("skipped"),
  Type.Literal("waiting"),
]);
export type FlowRunNodeStatus = Static<typeof flowRunNodeStatusSchema>;

export const flowRunNodeResultSchema = Type.Object({
  nodeId: Type.String({ minLength: 1 }),
  status: flowRunNodeStatusSchema,
  startedAt: Type.Optional(Type.String()),
  finishedAt: Type.Optional(Type.String()),
  outputs: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  error: Type.Optional(Type.String()),
});
export type FlowRunNodeResult = Static<typeof flowRunNodeResultSchema>;

export const flowRunStatusSchema = Type.Union([
  Type.Literal("succeeded"),
  Type.Literal("failed"),
  Type.Literal("waiting"),
]);
export type FlowRunStatus = Static<typeof flowRunStatusSchema>;

/** What started the run: the trigger node that fired, if any, and the payload it received. */
export const flowRunTriggerSchema = Type.Object({
  nodeId: Type.Union([Type.String(), Type.Null()]),
  payload: Type.Optional(Type.Unknown()),
});
export type FlowRunTrigger = Static<typeof flowRunTriggerSchema>;

/**
 * A complete run of one flow document. `nodes` lists every node of the document in
 * execution order, skipped ones included; `variables` is the final `vars` scope; `error`
 * explains a failure that no single node owns, such as an invalid graph.
 */
export const flowRunSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  flowId: Type.String({ minLength: 1 }),
  status: flowRunStatusSchema,
  startedAt: Type.String(),
  finishedAt: Type.String(),
  trigger: flowRunTriggerSchema,
  nodes: Type.Array(flowRunNodeResultSchema),
  variables: Type.Record(Type.String(), Type.Unknown()),
  error: Type.Optional(Type.String()),
});
export type FlowRun = Static<typeof flowRunSchema>;

/**
 * Runs the given document once and answers with the finished run. Until flows are persisted
 * the document travels in the body. `trigger.nodeId` picks which trigger fires; without it
 * every trigger without incoming edges fires with the same payload.
 */
export const flowRunRequestSchema = Type.Object({
  document: flowDocumentSchema,
  trigger: Type.Optional(
    Type.Object({
      nodeId: Type.Optional(Type.String({ minLength: 1 })),
      payload: Type.Optional(Type.Unknown()),
    }),
  ),
  /** `auto` answers screens the way Simulate does instead of stopping as `waiting`. */
  screens: Type.Optional(Type.Union([Type.Literal("wait"), Type.Literal("auto")])),
  /** How onchain nodes execute; Simulate defaults to `dry-run`, trigger-driven runs are live. */
  mode: Type.Optional(Type.Union([Type.Literal("dry-run"), Type.Literal("live")])),
});
export type FlowRunRequest = Static<typeof flowRunRequestSchema>;

export const runFlowContract = {
  method: "POST",
  path: "/flows/run",
  body: flowRunRequestSchema,
  response: { 200: flowRunSchema, ...apiErrorResponses },
} as const;

/**
 * What started a stored run: Simulate, a webhook call, the scheduler, a mini-app visitor, or
 * the onchain-event listener (`event`).
 */
export const flowRunSourceSchema = Type.Union([
  Type.Literal("manual"),
  Type.Literal("webhook"),
  Type.Literal("schedule"),
  Type.Literal("miniapp"),
  Type.Literal("event"),
]);
export type FlowRunSource = Static<typeof flowRunSourceSchema>;

/** A stored run as the history lists it; `flowName` is the flow's name at read time. */
export const flowRunSummarySchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  flowId: Type.String({ minLength: 1 }),
  flowName: Type.String(),
  status: flowRunStatusSchema,
  source: flowRunSourceSchema,
  startedAt: Type.String(),
  finishedAt: Type.String(),
});
export type FlowRunSummary = Static<typeof flowRunSummarySchema>;

/** A stored run with the document snapshot it executed, so a changed flow can still be read. */
export const flowRunRecordSchema = Type.Object({
  run: flowRunSchema,
  flowName: Type.String(),
  source: flowRunSourceSchema,
  document: flowDocumentSchema,
});
export type FlowRunRecord = Static<typeof flowRunRecordSchema>;

/** Runs a saved flow: only the trigger choice travels, the document is the stored one. */
export const runSavedFlowInputSchema = Type.Object(
  {
    trigger: Type.Optional(flowRunRequestSchema.properties.trigger),
    screens: Type.Optional(flowRunRequestSchema.properties.screens),
    mode: Type.Optional(flowRunRequestSchema.properties.mode),
  },
  { additionalProperties: false },
);
export type RunSavedFlowInput = Static<typeof runSavedFlowInputSchema>;

const flowParams = Type.Object({ id: Type.String({ minLength: 1 }) });

/** Runs the caller's saved flow once and stores the result; 404 when they have no such flow. */
export const runSavedFlowContract = {
  method: "POST",
  path: "/flows/:id/runs",
  params: flowParams,
  body: runSavedFlowInputSchema,
  response: { 201: flowRunRecordSchema, ...apiErrorResponses },
} as const;
export const listRunsContract = {
  method: "GET",
  path: "/flows/:id/runs",
  params: flowParams,
  response: { 200: Type.Object({ runs: Type.Array(flowRunSummarySchema) }), ...apiErrorResponses },
} as const;
/** The caller's most recent runs across every flow, newest first; `?flowId=` narrows to one. */
export const listAllRunsContract = {
  method: "GET",
  path: "/runs",
  query: Type.Object({ flowId: Type.Optional(Type.String({ minLength: 1 })) }),
  response: { 200: Type.Object({ runs: Type.Array(flowRunSummarySchema) }), ...apiErrorResponses },
} as const;
export const getRunContract = {
  method: "GET",
  path: "/runs/:id",
  params: flowParams,
  response: { 200: flowRunRecordSchema, ...apiErrorResponses },
} as const;
