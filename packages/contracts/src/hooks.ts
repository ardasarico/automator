import { Type, type Static } from "@sinclair/typebox";
import { apiErrorResponses } from "./contract";
import { flowRunStatusSchema } from "./flow-runs";

/**
 * The webhook trigger: anyone who knows a flow's hook URL can start it. The API answers
 * 404 for an unknown flow, a wrong token, a disabled flow, or a flow without a webhook
 * trigger node (all indistinguishable on purpose), and 429 when a flow is called too often.
 * The run happens synchronously and its id and outcome come back.
 */
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

/** What a webhook trigger node receives as its payload. */
export const webhookPayloadSchema = Type.Object({
  method: Type.String(),
  headers: Type.Record(Type.String(), Type.String()),
  query: Type.Record(Type.String(), Type.String()),
  body: Type.Unknown(),
});
export type WebhookPayload = Static<typeof webhookPayloadSchema>;
