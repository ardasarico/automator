import {
  createApiKeyContract,
  isCreateApiKeyInput,
  listApiKeysContract,
  revokeApiKeyContract,
  Type,
  type CreatedApiKey,
} from "@automator/contracts";
import { ApiKeyLimitError, type ApiKeyStore } from "@automator/db";
import { Elysia } from "elysia";
import { createAuthGuard } from "../auth/guard";
import type { IdentityProvider } from "../auth/privy";
import { createRateLimiter, defaultRateLimits } from "../rate-limit";
import { generateApiKey, hashApiKey, keyDisplayPrefix } from "./keys";

export interface ApiKeyRouteDependencies {
  identity: IdentityProvider | undefined;
  keys: ApiKeyStore;
  callsPerMinute?: number;
  now?: () => number;
}

/*
 * Where an owner manages the credentials machines call them with. These are dashboard routes,
 * reached with a Privy session: an API key cannot mint another API key.
 */
export function createApiKeyRoutes({
  identity,
  keys,
  callsPerMinute = defaultRateLimits.secrets,
  now = Date.now,
}: ApiKeyRouteDependencies) {
  const limiter = createRateLimiter(callsPerMinute, now);
  return new Elysia({ name: "api-keys" })
    .use(createAuthGuard(identity))
    .get(listApiKeysContract.path, async ({ claims }) => ({ keys: await keys.list(claims.id) }), {
      response: listApiKeysContract.response,
    })
    .post(
      createApiKeyContract.path,
      async ({ claims, body, status }) => {
        if (!isCreateApiKeyInput(body)) return status(400, { error: "invalid_request" });
        const key = generateApiKey();
        try {
          const summary = await keys.create(
            claims.id,
            body.name.trim(),
            hashApiKey(key),
            keyDisplayPrefix(key),
          );
          // The only time the key itself leaves the server.
          return status(201, { ...summary, key } satisfies CreatedApiKey);
        } catch (error) {
          if (error instanceof ApiKeyLimitError) return status(409, { error: "conflict" });
          throw error;
        }
      },
      {
        beforeHandle: ({ claims, set, status }) => {
          if (limiter.allow(claims.id)) return;
          set.headers["Retry-After"] = String(limiter.retryAfter(claims.id));
          return status(429, { error: "rate_limited" });
        },
        body: Type.Unknown(),
        response: createApiKeyContract.response,
      },
    )
    .delete(
      revokeApiKeyContract.path,
      async ({ claims, params, status }) => {
        const revoked = await keys.revoke(claims.id, params.id);
        return revoked ? { id: params.id } : status(404, { error: "not_found" });
      },
      { params: revokeApiKeyContract.params, response: revokeApiKeyContract.response },
    );
}
