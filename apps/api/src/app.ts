import {
  apiInfoContract,
  healthContract,
  livenessContract,
  type ApiErrorCode,
  type ApiInfoResponse,
  type LivenessResponse,
} from "@automator/contracts";
import type { createDatabase, UserStore } from "@automator/db";
import { Elysia } from "elysia";
import type { IdentityProvider } from "./auth/privy";
import { createAuthRoutes } from "./auth/routes";

export interface AppDependencies {
  database: Pick<ReturnType<typeof createDatabase>, "check">;
  users?: UserStore;
  identity?: IdentityProvider;
  /** Server-side request and failure logging, off by default so tests stay quiet. */
  log?: boolean;
}

/** Everything a client is allowed to learn about a failure. */
function sanitize(
  code: unknown,
  error: unknown,
): { status: number; body: { error: ApiErrorCode } } {
  if (code === "VALIDATION" || code === "PARSE") {
    // A response failing its own schema is a server bug, not a bad request.
    const failedResponse =
      typeof error === "object" && error !== null && "type" in error && error.type === "response";
    return failedResponse
      ? { status: 500, body: { error: "unavailable" } }
      : { status: 400, body: { error: "invalid_request" } };
  }
  if (code === "NOT_FOUND") return { status: 404, body: { error: "not_found" } };
  return { status: 503, body: { error: "unavailable" } };
}

export function createApp({ database, users, identity, log = false }: AppDependencies) {
  const startedAt = new WeakMap<Request, number>();

  return new Elysia()
    .onRequest(({ request, set }) => {
      // The API only serves per-user or point-in-time data; nothing here is cacheable.
      set.headers["Cache-Control"] = "no-store";
      if (log) startedAt.set(request, performance.now());
    })
    .onError(({ code, error, path, request, status }) => {
      const failure = sanitize(code, error);
      if (log && failure.status >= 500)
        console.error("API request failed", {
          method: request.method,
          path,
          code,
          kind: error instanceof Error ? error.constructor.name : typeof error,
          message: error instanceof Error ? error.message : undefined,
        });
      return status(failure.status, failure.body);
    })
    .onAfterResponse(({ request, path, set }) => {
      const start = startedAt.get(request);
      if (start === undefined) return;
      startedAt.delete(request);
      console.log(
        `${request.method} ${path} ${set.status ?? 200} ${Math.round(performance.now() - start)}ms`,
      );
    })
    .get(apiInfoContract.path, (): ApiInfoResponse => ({ name: "Automator API" }), {
      response: apiInfoContract.response,
    })
    .get(livenessContract.path, (): LivenessResponse => ({ status: "ok" }), {
      response: livenessContract.response,
    })
    .get(
      healthContract.path,
      async ({ status }) => {
        // `check` turns every failure into a status, so health reports instead of throwing.
        const databaseStatus = await database.check();
        const checkedAt = new Date().toISOString();
        return databaseStatus === "up"
          ? status(200, {
              status: "ok",
              checks: { api: "up", database: databaseStatus },
              checkedAt,
            })
          : status(503, {
              status: "error",
              checks: { api: "up", database: databaseStatus },
              checkedAt,
            });
      },
      { response: healthContract.response },
    )
    .use(users ? createAuthRoutes({ users, identity }) : new Elysia());
}
