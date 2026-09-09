import { Type, type Static } from "@sinclair/typebox";
import { apiErrorResponses } from "./contract";
import { flowDocumentSchema } from "./flows";

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

export const flowRunStatuses = ["succeeded", "failed", "waiting"] as const;
export type FlowRunStatus = (typeof flowRunStatuses)[number];
/* Unsafe preserves the literal union that mapping to Type.Union would widen. */
export const flowRunStatusSchema = Type.Unsafe<FlowRunStatus>(
  Type.Union(flowRunStatuses.map((status) => Type.Literal(status))),
);

/** Narrows a status read from a query string, which arrives as an arbitrary string. */
export function isFlowRunStatus(value: string): value is FlowRunStatus {
  return (flowRunStatuses as readonly string[]).includes(value);
}

export const flowRunTriggerSchema = Type.Object({
  nodeId: Type.Union([Type.String(), Type.Null()]),
  payload: Type.Optional(Type.Unknown()),
});
export type FlowRunTrigger = Static<typeof flowRunTriggerSchema>;

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

export const flowRunRequestSchema = Type.Object({
  document: flowDocumentSchema,
  trigger: Type.Optional(
    Type.Object({
      nodeId: Type.Optional(Type.String({ minLength: 1 })),
      payload: Type.Optional(Type.Unknown()),
    }),
  ),
  screens: Type.Optional(Type.Union([Type.Literal("wait"), Type.Literal("auto")])),
  mode: Type.Optional(Type.Union([Type.Literal("dry-run"), Type.Literal("live")])),
});
export type FlowRunRequest = Static<typeof flowRunRequestSchema>;

export const runFlowContract = {
  method: "POST",
  path: "/flows/run",
  body: flowRunRequestSchema,
  response: { 200: flowRunSchema, ...apiErrorResponses },
} as const;

export const flowRunSourceSchema = Type.Union([
  Type.Literal("manual"),
  Type.Literal("webhook"),
  Type.Literal("schedule"),
  Type.Literal("miniapp"),
  Type.Literal("event"),
  Type.Literal("watch"),
]);
export type FlowRunSource = Static<typeof flowRunSourceSchema>;

export const flowRunSummarySchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  flowId: Type.String({ minLength: 1 }),
  flowName: Type.String(),
  status: flowRunStatusSchema,
  source: flowRunSourceSchema,
  startedAt: Type.String(),
  finishedAt: Type.String(),
  /* Why a failed run failed, so a list of runs can say it without opening each one. */
  error: Type.Optional(Type.String()),
});
export type FlowRunSummary = Static<typeof flowRunSummarySchema>;

export const flowRunRecordSchema = Type.Object({
  run: flowRunSchema,
  flowName: Type.String(),
  source: flowRunSourceSchema,
  document: flowDocumentSchema,
});
export type FlowRunRecord = Static<typeof flowRunRecordSchema>;

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

export const runSavedFlowContract = {
  method: "POST",
  path: "/flows/:id/runs",
  params: flowParams,
  body: runSavedFlowInputSchema,
  response: { 201: flowRunRecordSchema, ...apiErrorResponses },
} as const;

export const runListDefaultLimit = 25;
export const runListMaxLimit = 100;

const runListPagingSchema = {
  cursor: Type.Optional(Type.String({ minLength: 1 })),
  limit: Type.Optional(Type.String({ minLength: 1 })),
};

export function parseRunListLimit(value: string | undefined): number | undefined | null {
  if (value === undefined) return undefined;
  if (!/^[0-9]+$/.test(value)) return null;
  const limit = Number(value);
  return limit >= 1 && limit <= runListMaxLimit ? limit : null;
}
export const runListQuerySchema = Type.Object({
  flowId: Type.Optional(Type.String({ minLength: 1 })),
  status: Type.Optional(flowRunStatusSchema),
  ...runListPagingSchema,
});
export type RunListQuery = Static<typeof runListQuerySchema>;

export const runListSchema = Type.Object({
  runs: Type.Array(flowRunSummarySchema),
  nextCursor: Type.Optional(Type.String({ minLength: 1 })),
});
export type RunList = Static<typeof runListSchema>;

export const listRunsContract = {
  method: "GET",
  path: "/flows/:id/runs",
  params: flowParams,
  query: Type.Object(runListPagingSchema),
  response: { 200: runListSchema, ...apiErrorResponses },
} as const;
export const listAllRunsContract = {
  method: "GET",
  path: "/runs",
  query: runListQuerySchema,
  response: { 200: runListSchema, ...apiErrorResponses },
} as const;
export const getRunContract = {
  method: "GET",
  path: "/runs/:id",
  params: flowParams,
  response: { 200: flowRunRecordSchema, ...apiErrorResponses },
} as const;

export function transactionHashes(output: unknown): string[] {
  const hashes: string[] = [];
  const visit = (value: unknown, depth: number) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return;
    for (const [key, item] of Object.entries(value)) {
      if ((key === "hash" || key === "transactionHash") && typeof item === "string") {
        if (/^0x[0-9a-fA-F]{64}$/.test(item) && !hashes.includes(item)) hashes.push(item);
      } else if (depth < 1) visit(item, depth + 1);
    }
  };
  visit(output, 0);
  return hashes;
}
