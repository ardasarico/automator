import { Type, type Static } from "@sinclair/typebox";
import { apiErrorResponses } from "./contract";
import { flowDocumentSchema } from "./flows";

export const flowVersionSummarySchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  number: Type.Integer({ minimum: 1 }),
  name: Type.String(),
  createdAt: Type.String(),
  nodeCount: Type.Integer({ minimum: 0 }),
});
export type FlowVersionSummary = Static<typeof flowVersionSummarySchema>;

export const flowVersionRecordSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  number: Type.Integer({ minimum: 1 }),
  name: Type.String(),
  description: Type.String(),
  document: flowDocumentSchema,
  createdAt: Type.String(),
});
export type FlowVersionRecord = Static<typeof flowVersionRecordSchema>;

export const listFlowVersionsContract = {
  method: "GET",
  path: "/flows/:id/versions",
  params: Type.Object({ id: Type.String({ minLength: 1 }) }),
  response: {
    200: Type.Object({ versions: Type.Array(flowVersionSummarySchema) }),
    ...apiErrorResponses,
  },
} as const;
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
