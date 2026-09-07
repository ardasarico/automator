import { Type, type Static } from "@sinclair/typebox";
import { apiErrorResponses } from "./contract";

/** What a visitor may learn about a published flow: enough to title its mini-app. */
export const publicFlowSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  name: Type.String(),
  description: Type.String(),
  updatedAt: Type.String(),
});
export type PublicFlow = Static<typeof publicFlowSchema>;

/**
 * Unauthenticated read of a flow that its owner published to the marketplace, for the
 * runtime that hosts it. The document itself never leaves the API: the runtime plays the
 * flow through mini-app sessions. An unpublished or missing flow answers 404 either way.
 */
export const getPublicFlowContract = {
  method: "GET",
  path: "/public/flows/:id",
  params: Type.Object({ id: Type.String({ minLength: 1 }) }),
  response: { 200: publicFlowSchema, ...apiErrorResponses },
} as const;
