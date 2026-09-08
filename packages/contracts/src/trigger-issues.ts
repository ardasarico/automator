import { Type, type Static } from "@sinclair/typebox";
import { apiErrorResponses } from "./contract";
import { flowRunRecordSchema } from "./flow-runs";

/** Retained polling-trigger evidence; running does not prove the worker is still alive. */
export const triggerExecutionIssueSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  nodeId: Type.String({ minLength: 1 }),
  source: Type.Union([Type.Literal("schedule"), Type.Literal("event"), Type.Literal("watch")]),
  status: Type.Union([
    Type.Literal("running"),
    Type.Literal("uncertain"),
    Type.Literal("completed"),
  ]),
  startedAt: Type.String(),
  historySaved: Type.Boolean(),
  record: Type.Union([flowRunRecordSchema, Type.Null()]),
});
export type TriggerExecutionIssue = Static<typeof triggerExecutionIssueSchema>;

export const listTriggerIssuesContract = {
  method: "GET",
  path: "/flows/:id/trigger-issues",
  params: Type.Object({ id: Type.String({ minLength: 1 }) }),
  response: {
    200: Type.Object({ issues: Type.Array(triggerExecutionIssueSchema, { maxItems: 50 }) }),
    ...apiErrorResponses,
  },
} as const;
