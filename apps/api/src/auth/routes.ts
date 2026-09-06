import { meContract, profileContract, sessionContract } from "@automator/contracts";
import { UsernameTakenError, type UserStore } from "@automator/db";
import { Elysia } from "elysia";
import type { IdentityProvider } from "./privy";

export interface AuthDependencies {
  users: UserStore;
  identity: IdentityProvider | undefined;
}
const reservedUsernames = new Set([
  "admin",
  "administrator",
  "automator",
  "support",
  "api",
  "root",
  "login",
  "onboarding",
  "settings",
  "flows",
  "marketplace",
]);

export function createAuthRoutes({ users, identity }: AuthDependencies) {
  return new Elysia({ name: "auth", normalize: false })
    .onRequest(({ set }) => {
      set.headers["Cache-Control"] = "no-store";
    })
    .onError(({ code, error, path, status }) => {
      if (code === "VALIDATION" || code === "PARSE")
        return status(422, { error: "invalid_profile" as const });
      console.error("Auth API failed", {
        path,
        kind: error.constructor.name,
        code: "code" in error && typeof error.code === "string" ? error.code : code,
      });
      return status(503, { error: "unavailable" as const });
    })
    .resolve(async ({ headers, status }) => {
      const match = headers.authorization?.match(/^Bearer ([^\s]+)$/i);
      if (!match?.[1]) return status(401, { error: "unauthorized" as const });
      if (!identity) return status(503, { error: "unavailable" as const });
      const claims = await identity.verify(match[1]);
      if (!claims) return status(401, { error: "unauthorized" as const });
      return { claims };
    })
    .post(
      sessionContract.path,
      async ({ claims }) => {
        const walletAddress = await identity!.walletAddress(claims.id);
        const user = await users.sync(claims.id, walletAddress);
        return { user, expiresAt: claims.expiresAt };
      },
      { response: sessionContract.response },
    )
    .get(meContract.path, async ({ claims }) => ({ user: await users.find(claims.id) }), {
      response: meContract.response,
    })
    .put(
      profileContract.path,
      async ({ claims, body, status }) => {
        if (reservedUsernames.has(body.username))
          return status(409, { error: "username_reserved" });
        if (!(await users.find(claims.id))) return status(401, { error: "unauthorized" });
        try {
          return { user: await users.saveProfile(claims.id, body) };
        } catch (error) {
          if (error instanceof UsernameTakenError) return status(409, { error: "username_taken" });
          throw error;
        }
      },
      { body: profileContract.body, response: profileContract.response },
    );
}
