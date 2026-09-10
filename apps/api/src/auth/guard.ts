import { Elysia } from "elysia";
import type { IdentityProvider } from "./privy";

interface Claims {
  id: string;
  expiresAt: number;
}

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
