import {
  apiInfoContract,
  healthContract,
  livenessContract,
  type ApiErrorCode,
  type ApiInfoResponse,
  type LivenessResponse,
} from "@automator/contracts";
import type {
  AccountStore,
  createDatabase,
  FlowStore,
  ListingStore,
  RunStore,
  SecretStore,
  SessionStore,
  UserStore,
} from "@automator/db";
import type { LanguageModel } from "@automator/flow-engine";
import { Elysia } from "elysia";
import type { IdentityProvider } from "./auth/privy";
import type { ChainFactory } from "./chain/provider";
import { createAccountRoutes } from "./account/routes";
import { createAiRoutes } from "./ai/routes";
import { createAuthRoutes } from "./auth/routes";
import { createFlowRoutes } from "./flows/routes";
import { createHookRoutes } from "./hooks/routes";
import { createPublicRoutes } from "./public/routes";
import { createMarketplaceRoutes } from "./marketplace/routes";
import { createRunRoutes } from "./runs/routes";
import { createQuickJsSandbox } from "./sandbox/quickjs";
import type { SecretsCrypto } from "./secrets/crypto";
import { createSecretsResolver } from "./secrets/resolver";
import { createSecretRoutes } from "./secrets/routes";
import { createSessionRoutes } from "./sessions/routes";

export interface AppDependencies {
  database: Pick<ReturnType<typeof createDatabase>, "check">;
  users?: UserStore;
  flows?: FlowStore;
  runs?: RunStore;
  listings?: ListingStore;
  /** User secrets and their cipher; both or neither, so `{{secrets.*}}` resolves consistently. */
  secrets?: SecretStore;
  secretsCrypto?: SecretsCrypto;
  /** Mini-app sessions for published flows; needs flows, runs and secrets as well. */
  sessions?: SessionStore;
  /** Per-user usage counts for the Settings dialog. */
  account?: AccountStore;
  identity?: IdentityProvider;
  /** The chat model for AI nodes and flow generation; absent without an OpenRouter key. */
  model?: LanguageModel;
  /** Chains for onchain nodes, per user and mode; absent when the API has no chain provider. */
  chainFactory?: ChainFactory;
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

export function createApp({
  database,
  users,
  flows,
  runs,
  listings,
  secrets,
  secretsCrypto,
  sessions,
  account,
  identity,
  log = false,
  model,
  chainFactory,
}: AppDependencies) {
  const startedAt = new WeakMap<Request, number>();
  const secretsAccess = secrets && secretsCrypto ? { secrets, crypto: secretsCrypto } : undefined;
  const secretsFor = secretsAccess
    ? (ownerId: string) => createSecretsResolver(secretsAccess, ownerId)
    : undefined;
  const sandbox = createQuickJsSandbox();
  // Trigger-driven runs (webhooks, the scheduler) get the same model, sandbox and secrets as a session run.
  const engineFor = (ownerId: string) => ({ model, sandbox, secrets: secretsFor?.(ownerId) });

  return (
    new Elysia()
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
      .use(users ? createAuthRoutes({ users, identity }) : new Elysia())
      .use(flows ? createFlowRoutes({ flows, identity }) : new Elysia())
      // Published flows are readable without a session, for the runtime that hosts them.
      .use(flows ? createPublicRoutes({ flows }) : new Elysia())
      // Any signed-in user may run a document statelessly; saved runs need both stores.
      .use(createRunRoutes({ identity, flows, runs, engine: { model }, secretsFor, chainFactory }))
      // Webhook calls carry no session: the flow's token is the credential.
      .use(
        flows && runs
          ? createHookRoutes({ flows, runs, engine: engineFor, chainFactory })
          : new Elysia(),
      )
      .use(secretsAccess ? createSecretRoutes({ identity, ...secretsAccess }) : new Elysia())
      // Visitors play a published flow through sessions; the API runs it as the owner.
      .use(
        flows && runs && sessions
          ? createSessionRoutes({
              flows,
              runs,
              sessions,
              engine: { model, sandbox },
              secretsFor,
              chainFactory,
            })
          : new Elysia(),
      )
      .use(createAiRoutes({ identity, model, log }))
      .use(account ? createAccountRoutes({ account, identity }) : new Elysia())
      // Listings publish and fork the caller's flows, so they need both stores and the user profile.
      .use(
        listings && flows && users
          ? createMarketplaceRoutes({ listings, flows, users, identity })
          : new Elysia(),
      )
  );
}
