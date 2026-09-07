import { Type, type Static } from "@sinclair/typebox";
import { apiErrorResponses } from "./contract";
import { flowDocumentSchema } from "./flows";

/**
 * A saved version as the History panel lists it: `number` counts up from 1 per flow and
 * the newest is the flow's current document; `createdAt` is ISO-8601.
 */
export const flowVersionSummarySchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  number: Type.Integer({ minimum: 1 }),
  name: Type.String(),
  createdAt: Type.String(),
  nodeCount: Type.Integer({ minimum: 0 }),
});
export type FlowVersionSummary = Static<typeof flowVersionSummarySchema>;

/** A saved version with the document it captured, so the canvas can restore it. */
export const flowVersionRecordSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  number: Type.Integer({ minimum: 1 }),
  name: Type.String(),
  description: Type.String(),
  document: flowDocumentSchema,
  createdAt: Type.String(),
});
export type FlowVersionRecord = Static<typeof flowVersionRecordSchema>;

/** The caller's saved versions of one flow, newest first; 404 when the flow is not theirs. */
export const listFlowVersionsContract = {
  method: "GET",
  path: "/flows/:id/versions",
  params: Type.Object({ id: Type.String({ minLength: 1 }) }),
  response: {
    200: Type.Object({ versions: Type.Array(flowVersionSummarySchema) }),
    ...apiErrorResponses,
  },
} as const;
/** One version by number; 404 when the flow is not the caller's or the number never existed. */
export const getFlowVersionContract = {
  method: "GET",
  path: "/flows/:id/versions/:number",
  params: Type.Object({
    id: Type.String({ minLength: 1 }),
    number: Type.String({ minLength: 1 }),
  }),
  response: { 200: flowVersionRecordSchema, ...apiErrorResponses },
} as const;

export type ListFlowVersionsResponse = Static<(typeof listFlowVersionsContract.response)[200]>;
