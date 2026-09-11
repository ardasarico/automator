import { Type, type Static } from "@sinclair/typebox";
import { apiErrorResponses } from "./contract";
import { flowDocumentSchema } from "./flows";
import { flowRunStatusSchema } from "./run-status";

export const flowRunNodeStatusSchema = Type.Union([
  Type.Literal("succeeded"),
  Type.Literal("failed"),
  Type.Literal("skipped"),
  Type.Literal("waiting"),
]);
export type FlowRunNodeStatus = Static<typeof flowRunNodeStatusSchema>;

/**
 * Why a node was skipped. A run halts on the first failure, so a skipped node either never got an
 * input or was still queued when the run stopped; saying which keeps the run views from blaming a
 * missing edge for a halt on another branch.
 */
export const flowRunNodeSkipReasonSchema = Type.Union([
  Type.Literal("no-input"),
  Type.Literal("run-stopped"),
]);
export type FlowRunNodeSkipReason = Static<typeof flowRunNodeSkipReasonSchema>;

export const flowRunNodeResultSchema = Type.Object({
  nodeId: Type.String({ minLength: 1 }),
  status: flowRunNodeStatusSchema,
  /* Optional: runs recorded before the reason existed carry none. */
  skipReason: Type.Optional(flowRunNodeSkipReasonSchema),
  startedAt: Type.Optional(Type.String()),
  finishedAt: Type.Optional(Type.String()),
  outputs: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  error: Type.Optional(Type.String()),
});
export type FlowRunNodeResult = Static<typeof flowRunNodeResultSchema>;

/* The run status lives in its own module because the flow summary carries a last run, and
 * flows.ts cannot import this one back. */
export {
  flowRunStatuses,
  flowRunStatusSchema,
  isFlowRunStatus,
  type FlowRunStatus,
} from "./run-status";

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
  /* What the run answered with, from the first Return node it reached. Absent when it reached
   * none, which is every flow that is not published as an API. */
  output: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
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

/** Every way a run can start, in the order the usage summary lists them. */
export const flowRunSources = [
  "manual",
  "webhook",
  "schedule",
  "miniapp",
  "event",
  "watch",
  "api",
] as const;
export type FlowRunSource = (typeof flowRunSources)[number];
/* Unsafe preserves the literal union that mapping to Type.Union would widen. */
export const flowRunSourceSchema = Type.Unsafe<FlowRunSource>(
  Type.Union(flowRunSources.map((source) => Type.Literal(source))),
);

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

/**
 * What a run list can be ordered by. The column headings carry these: a list of runs is read
 * by outcome and by how long they took as often as by when they started.
 */
export const runSortKeys = ["started", "flow", "status", "trigger", "duration"] as const;
export type RunSortKey = (typeof runSortKeys)[number];
/* Unsafe preserves the literal union that mapping to Type.Union would widen. */
export const runSortKeySchema = Type.Unsafe<RunSortKey>(
  Type.Union(runSortKeys.map((key) => Type.Literal(key))),
);
export function isRunSortKey(value: string): value is RunSortKey {
  return (runSortKeys as readonly string[]).includes(value);
}

export const runSortDirections = ["asc", "desc"] as const;
export type RunSortDirection = (typeof runSortDirections)[number];
export const runSortDirectionSchema = Type.Unsafe<RunSortDirection>(
  Type.Union(runSortDirections.map((direction) => Type.Literal(direction))),
);
export function isRunSortDirection(value: string): value is RunSortDirection {
  return (runSortDirections as readonly string[]).includes(value);
}

/** Newest first, longest first, everything else A–Z: what each column means by default. */
export const runSortDefaults: Record<RunSortKey, RunSortDirection> = {
  started: "desc",
  flow: "asc",
  status: "asc",
  trigger: "asc",
  duration: "desc",
};

const runListPagingSchema = {
  cursor: Type.Optional(Type.String({ minLength: 1 })),
  limit: Type.Optional(Type.String({ minLength: 1 })),
  sort: Type.Optional(runSortKeySchema),
  dir: Type.Optional(runSortDirectionSchema),
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
/**
 * Runs counted by day and outcome, for the chart above the list. A page of runs cannot answer
 * this — it is a window, not a history — so the API counts them where they are stored.
 */
export const runStatsWindowDays = 14;

export const runStatsDaySchema = Type.Object({
  /* The UTC day the runs started, as YYYY-MM-DD. */
  date: Type.String({ minLength: 10, maxLength: 10 }),
  succeeded: Type.Integer({ minimum: 0 }),
  failed: Type.Integer({ minimum: 0 }),
  waiting: Type.Integer({ minimum: 0 }),
});
export type RunStatsDay = Static<typeof runStatsDaySchema>;

export const runStatsSchema = Type.Object({
  /* One entry per day in the window, oldest first, including the days nothing ran. */
  days: Type.Array(runStatsDaySchema),
  totals: Type.Object({
    succeeded: Type.Integer({ minimum: 0 }),
    failed: Type.Integer({ minimum: 0 }),
    waiting: Type.Integer({ minimum: 0 }),
  }),
});
export type RunStats = Static<typeof runStatsSchema>;

export const runStatsContract = {
  method: "GET",
  path: "/runs/stats",
  query: Type.Object({ flowId: Type.Optional(Type.String({ minLength: 1 })) }),
  response: { 200: runStatsSchema, ...apiErrorResponses },
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
