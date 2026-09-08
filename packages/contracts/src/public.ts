import { Type, type Static } from "@sinclair/typebox";
import { apiErrorResponses } from "./contract";

export const publicFlowSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  name: Type.String(),
  description: Type.String(),
  updatedAt: Type.String(),
});
export type PublicFlow = Static<typeof publicFlowSchema>;

export const getPublicFlowContract = {
  method: "GET",
  path: "/public/flows/:id",
  params: Type.Object({ id: Type.String({ minLength: 1 }) }),
  response: { 200: publicFlowSchema, ...apiErrorResponses },
} as const;
