import { Type, type Static } from "@sinclair/typebox";
import { Check } from "@sinclair/typebox/value";
import { apiErrorResponses } from "./contract";

/*
 * The credential a machine calls the API with. A key belongs to one owner and stands for that
 * owner alone; it is never accepted on the dashboard routes, and a dashboard session is never
 * accepted on the machine ones, so neither credential can be replayed as the other.
 */

/** Every key starts with this, so a leaked one is recognisable in a log or a scanner. */
export const apiKeyPrefix = "ak_";
/** How much of a key is stored in the clear, enough to tell two keys apart in a list. */
export const apiKeyDisplayLength = 11;
/** How many live keys one owner may hold. */
export const apiKeyLimit = 20;

export const apiKeyNameSchema = Type.String({ minLength: 1, maxLength: 60, pattern: "\\S" });

export const apiKeySummarySchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  name: Type.String(),
  /* The visible head of the key; the rest exists only in the caller's hands. */
  prefix: Type.String(),
  createdAt: Type.String(),
  /* Absent until the key is first used. */
  lastUsedAt: Type.Optional(Type.String()),
});
export type ApiKeySummary = Static<typeof apiKeySummarySchema>;

/** The one and only response that carries the key itself. It is never readable again. */
export const createdApiKeySchema = Type.Object({
  ...apiKeySummarySchema.properties,
  key: Type.String({ minLength: 1 }),
});
export type CreatedApiKey = Static<typeof createdApiKeySchema>;

export const createApiKeyInputSchema = Type.Object(
  { name: apiKeyNameSchema },
  { additionalProperties: false },
);
export type CreateApiKeyInput = Static<typeof createApiKeyInputSchema>;

export function isCreateApiKeyInput(body: unknown): body is CreateApiKeyInput {
  return Check(createApiKeyInputSchema, body);
}

const apiKeyParams = Type.Object({ id: Type.String({ minLength: 1 }) });

export const listApiKeysContract = {
  method: "GET",
  path: "/api-keys",
  response: {
    200: Type.Object({ keys: Type.Array(apiKeySummarySchema) }),
    ...apiErrorResponses,
  },
} as const;
export const createApiKeyContract = {
  method: "POST",
  path: "/api-keys",
  body: createApiKeyInputSchema,
  response: { 201: createdApiKeySchema, ...apiErrorResponses },
} as const;
export const revokeApiKeyContract = {
  method: "DELETE",
  path: "/api-keys/:id",
  params: apiKeyParams,
  response: { 200: Type.Object({ id: Type.String({ minLength: 1 }) }), ...apiErrorResponses },
} as const;
