import {
  isProfileInput,
  meContract,
  profileContract,
  sessionContract,
  Type,
} from "@automator/contracts";
import { UsernameTakenError, type UserStore } from "@automator/db";
import { Elysia } from "elysia";
import { createAuthGuard } from "./guard";
import type { IdentityProvider } from "./privy";

export interface AuthDependencies {
  users: UserStore;
  identity: IdentityProvider | undefined;
}

/** Usernames that would collide with a current or planned route segment. */
const reservedUsernames = new Set([
  "admin",
  "administrator",
  "api",
  "auth",
  "automator",
  "create",
  "flows",
  "health",
  "help",
  "login",
  "marketplace",
  "me",
  "null",
  "onboarding",
  "privy",
  "root",
  "runs",
  "settings",
  "support",
  "system",
  "undefined",
  "www",
]);

export function createAuthRoutes({ users, identity }: AuthDependencies) {
  return new Elysia({ name: "auth" })
    .use(createAuthGuard(identity))
    .post(
      sessionContract.path,
      async ({ claims }) => {
        const stored = await users.find(claims.id);
        // Privy is only asked for a wallet while the stored user has none.
        const walletAddress = stored?.walletAddress ?? (await identity!.walletAddress(claims.id));
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
        // Checked here rather than by the route schema so that a profile the user
        // can fix answers 422 `invalid_profile` instead of the generic 400.
        if (!isProfileInput(body)) return status(422, { error: "invalid_profile" });
        // Normalized before storing so two spellings of the same name compare equal.
        const name = body.name.normalize("NFC").trim();
        if (!name) return status(422, { error: "invalid_profile" });
        if (reservedUsernames.has(body.username))
          return status(409, { error: "username_reserved" });
        if (!(await users.find(claims.id))) return status(401, { error: "unauthorized" });
        try {
          return { user: await users.saveProfile(claims.id, { ...body, name }) };
        } catch (error) {
          if (error instanceof UsernameTakenError) return status(409, { error: "username_taken" });
          throw error;
        }
      },
      // The contract schema is applied in the handler, so the wire only has to be JSON.
      { body: Type.Unknown(), response: profileContract.response },
    );
}
