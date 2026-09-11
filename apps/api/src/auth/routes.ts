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

/** The body's username lower-cased, trimmed and NFC-normalised, or undefined when it has none. */
function foldedUsername(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return undefined;
  const { username } = body as { username?: unknown };
  return typeof username === "string" ? username.normalize("NFC").trim().toLowerCase() : undefined;
}

export function createAuthRoutes({ users, identity }: AuthDependencies) {
  return new Elysia({ name: "auth" })
    .use(createAuthGuard(identity))
    .post(
      sessionContract.path,
      async ({ claims }) => {
        const stored = await users.find(claims.id);
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
        // can fix answers 422 `invalid_profile` instead of the generic 400. Shape first: a body
        // that stays invalid even with its username folded is a 422, whatever the name was.
        const username = foldedUsername(body);
        const folded = username === undefined ? body : { ...(body as object), username };
        if (!isProfileInput(folded)) return status(422, { error: "invalid_profile" });
        const name = folded.name.normalize("NFC").trim();
        if (!name) return status(422, { error: "invalid_profile" });
        // Then the reserved lookup, on the folded username, so "Admin " is refused as reserved
        // rather than slipping past as a different spelling.
        if (reservedUsernames.has(folded.username))
          return status(409, { error: "username_reserved" });
        // The schema admits only lower-case names, so the value stored is the folded one.
        if (!isProfileInput(body)) return status(422, { error: "invalid_profile" });
        if (!(await users.find(claims.id))) return status(401, { error: "unauthorized" });
        try {
          return { user: await users.saveProfile(claims.id, { ...body, name }) };
        } catch (error) {
          if (error instanceof UsernameTakenError) return status(409, { error: "username_taken" });
          throw error;
        }
      },
      { body: Type.Unknown(), response: profileContract.response },
    );
}
