import { Type, type Static } from "@sinclair/typebox";
import { apiErrorResponses } from "./contract";
import { flowRunStatusSchema } from "./flow-runs";

export const webhookTriggerContract = {
  method: "POST",
  path: "/hooks/:flowId/:token",
  params: Type.Object({
    flowId: Type.String({ minLength: 1 }),
    token: Type.String({ minLength: 1 }),
  }),
  response: {
    202: Type.Object({ runId: Type.String({ minLength: 1 }), status: flowRunStatusSchema }),
    ...apiErrorResponses,
  },
} as const;
export type WebhookTriggerResponse = Static<(typeof webhookTriggerContract.response)[202]>;

export const webhookPayloadSchema = Type.Object({
  method: Type.String(),
  headers: Type.Record(Type.String(), Type.String()),
  query: Type.Record(Type.String(), Type.String()),
  body: Type.Unknown(),
});
export type WebhookPayload = Static<typeof webhookPayloadSchema>;
