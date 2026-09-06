import { Elysia } from "elysia";
import type { IdentityProvider } from "./privy";

export interface Claims {
  id: string;
  expiresAt: number;
}

/**
 * Turns a bearer token into `claims` for every route of the plugin that mounts
 * this guard. Routes never see an unauthenticated request: a missing or invalid
 * token answers 401 here, and an identity provider that is not configured or
 * fails upstream answers 503 rather than pretending the user is logged out.
 */
export function createAuthGuard(identity: IdentityProvider | undefined) {
  return new Elysia({ name: "auth-guard" }).resolve(
    { as: "scoped" },
    async ({ headers, status }) => {
      const token = headers.authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
      if (!token) return status(401, { error: "unauthorized" as const });
      if (!identity) return status(503, { error: "unavailable" as const });
      const claims = await identity.verify(token);
      if (!claims) return status(401, { error: "unauthorized" as const });
      return { claims: claims satisfies Claims };
    },
  );
}
