import { Elysia } from "elysia";
import { readBearerApiKey } from "./keys";
import type { ApiKeyVerifier } from "./verify";

export interface Caller {
  id: string;
}

/**
 * Authenticates a machine caller. A Privy token is refused here and an API key is refused by the
 * dashboard guard, so neither credential can be replayed as the other.
 */
export function createMachineGuard(verifier: ApiKeyVerifier | undefined) {
  return new Elysia({ name: "api-key-guard" }).resolve(
    { as: "scoped" },
    async ({ headers, status }) => {
      const key = readBearerApiKey(headers.authorization);
      if (!key) return status(401, { error: "unauthorized" as const });
      if (!verifier) return status(503, { error: "unavailable" as const });
      const caller = await verifier.verify(key);
      if (!caller) return status(401, { error: "unauthorized" as const });
      return { caller: caller satisfies Caller };
    },
  );
}
