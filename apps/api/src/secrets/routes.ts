import {
  deleteSecretContract,
  isSecretName,
  listSecretsContract,
  putSecretContract,
  secretValueInputSchema,
  Type,
  Value,
} from "@automator/contracts";
import { Elysia } from "elysia";
import { createAuthGuard } from "../auth/guard";
import type { IdentityProvider } from "../auth/privy";
import { createRateLimiter, defaultRateLimits } from "../rate-limit";
import type { SecretsAccess } from "./resolver";

export interface SecretDependencies extends SecretsAccess {
  identity: IdentityProvider | undefined;
  callsPerMinute?: number;
  now?: () => number;
}

export function createSecretRoutes({
  identity,
  secrets,
  crypto,
  callsPerMinute = defaultRateLimits.secrets,
  now = Date.now,
}: SecretDependencies) {
  const limiter = createRateLimiter(callsPerMinute, now);
  return new Elysia({ name: "secrets" })
    .use(createAuthGuard(identity))
    .get(
      listSecretsContract.path,
      async ({ claims }) => ({ secrets: await secrets.list(claims.id) }),
      {
        response: listSecretsContract.response,
      },
    )
    .put(
      putSecretContract.path,
      async ({ claims, params, body, status }) => {
        if (!isSecretName(params.name) || !Value.Check(secretValueInputSchema, body))
          return status(400, { error: "invalid_request" });
        return secrets.put(claims.id, params.name, crypto.encrypt(body.value));
      },
      {
        beforeHandle: ({ claims, set, status }) => {
          if (limiter.allow(claims.id)) return;
          set.headers["Retry-After"] = String(limiter.retryAfter(claims.id));
          return status(429, { error: "rate_limited" });
        },
        params: Type.Object({ name: Type.String() }),
        body: Type.Unknown(),
        response: putSecretContract.response,
      },
    )
    .delete(
      deleteSecretContract.path,
      async ({ claims, params, status }) => {
        if (!isSecretName(params.name)) return status(400, { error: "invalid_request" });
        const removed = await secrets.remove(claims.id, params.name);
        return removed ? { name: params.name } : status(404, { error: "not_found" });
      },
      { params: Type.Object({ name: Type.String() }), response: deleteSecretContract.response },
    );
}
