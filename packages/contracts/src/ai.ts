import { Type, type Static } from "@sinclair/typebox";
import { apiErrorResponses } from "./contract";
import { flowDocumentInputSchema } from "./flows";

/**
 * Asks the model for a flow. Without `document` it designs a new one from the prompt; with
 * it, the prompt is an instruction to change that document. The answer is a complete
 * document input the canvas can apply as it is, laid out left to right.
 */
export const generateFlowRequestSchema = Type.Object({
  prompt: Type.String({ minLength: 1, maxLength: 4000 }),
  document: Type.Optional(flowDocumentInputSchema),
});
export type GenerateFlowRequest = Static<typeof generateFlowRequestSchema>;

export const generateFlowResponseSchema = Type.Object({
  document: flowDocumentInputSchema,
  /** One or two sentences from the model on what the flow does or what changed. */
  summary: Type.String(),
});
export type GenerateFlowResponse = Static<typeof generateFlowResponseSchema>;

export const generateFlowContract = {
  method: "POST",
  path: "/ai/flows",
  body: generateFlowRequestSchema,
  response: { 200: generateFlowResponseSchema, ...apiErrorResponses },
} as const;
