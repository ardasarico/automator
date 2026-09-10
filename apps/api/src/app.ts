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
  ApiKeyStore,
  createDatabase,
  DataRecordStore,
  DataTableStore,
  FlowStore,
  FlowVersionStore,
  ListingStore,
  NodePresetStore,
  RunStore,
  SecretStore,
  SessionStore,
  UserStore,
} from "@automator/db";
import type { GraphGateway, LanguageModel } from "@automator/flow-engine";
import { Elysia } from "elysia";
import type { IdentityProvider } from "./auth/privy";
import type { ChainFactory } from "./chain/provider";
import { createAccountRoutes } from "./account/routes";
import { createApiKeyRoutes } from "./api-publishing/key-routes";
import { createMachineRoutes } from "./api-publishing/routes";
import { createApiKeyVerifier } from "./api-publishing/verify";
import { createAiRoutes } from "./ai/routes";
import { createAuthRoutes } from "./auth/routes";
import type { DataFactory } from "./data/provider";
import { createDataRoutes } from "./data/routes";
import { createFlowRoutes } from "./flows/routes";
import { createTriggerIssueRoutes, type TriggerIssueReader } from "./flows/trigger-issues";
import { createFlowVersionRoutes } from "./flows/versions";
import { createHookRoutes } from "./hooks/routes";
import { createPublicRoutes } from "./public/routes";
import { createMarketplaceRoutes } from "./marketplace/routes";
import type { CallableFlowSource } from "./mcp/callable-flows";
import { createMcpRoutes, type ApiKeyVerifier } from "./mcp/routes";
import { createRunRoutes } from "./runs/routes";
import { defaultRateLimits, type RateLimits } from "./rate-limit";
import { createQuickJsSandbox } from "./sandbox/quickjs";
import type { SecretsCrypto } from "./secrets/crypto";
import { createSecretsResolver } from "./secrets/resolver";
import { createNodePresetRoutes } from "./node-presets/routes";
import { createSecretRoutes } from "./secrets/routes";
import { createSessionRoutes } from "./sessions/routes";
import { createWalletRoutes } from "./wallet/routes";
import { createPaymentPolicyRoutes, type PaymentPolicyAccess } from "./wallet/payment-policy";
import type { WorldVerifier } from "./world/verify";

export interface AppDependencies {
  database: Pick<ReturnType<typeof createDatabase>, "check">;
  users?: UserStore;
  flows?: FlowStore;
  runs?: RunStore;
  listings?: ListingStore;
  secrets?: SecretStore;
  secretsCrypto?: SecretsCrypto;
  sessions?: SessionStore;
  account?: AccountStore;
  apiKeys?: ApiKeyStore;
  identity?: IdentityProvider;
  model?: LanguageModel;
  /** The Graph gateway key for subgraph queries; without it those nodes fail as unconfigured. */
  graph?: GraphGateway;
  chainFactory?: ChainFactory;
  dataTables?: DataTableStore;
  dataRecords?: DataRecordStore;
  nodePresets?: NodePresetStore;
  dataFactory?: DataFactory;
  world?: WorldVerifier;
  log?: boolean;
  rateLimits?: Partial<RateLimits>;
  flowVersions?: FlowVersionStore;
  triggerIssues?: TriggerIssueReader;
  paymentPolicies?: PaymentPolicyAccess;
  /* The flows an API key may run as MCP tools, and the keys that name their owner. */
  callableFlows?: CallableFlowSource;
  apiKeys?: ApiKeyVerifier;
}

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

/** The final webhook path segment authorizes execution and must never enter access logs. */
function logPath(path: string): string {
  return path.replace(/^(\/hooks\/[^/]+\/)[^/]+/, "$1[redacted]");
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
  apiKeys,
  identity,
  log = false,
  model,
  graph,
  chainFactory,
  dataTables,
  dataRecords,
  nodePresets,
  dataFactory,
  rateLimits,
  world,
  flowVersions,
  triggerIssues,
  paymentPolicies,
  callableFlows,
  apiKeys,
}: AppDependencies) {
  const limits = { ...defaultRateLimits, ...rateLimits };
  const startedAt = new WeakMap<Request, number>();
  const secretsAccess = secrets && secretsCrypto ? { secrets, crypto: secretsCrypto } : undefined;
  const secretsFor = secretsAccess
    ? (ownerId: string) => createSecretsResolver(secretsAccess, ownerId)
    : undefined;
  const sandbox = createQuickJsSandbox();
  const engineFor = (ownerId: string) => ({
    model,
    graph,
    sandbox,
    secrets: secretsFor?.(ownerId),
  });

  return new Elysia()
    .onRequest(({ request, set }) => {
      set.headers["Cache-Control"] = "no-store";
      if (log) startedAt.set(request, performance.now());
    })
    .onError(({ code, error, path, request, status }) => {
      const failure = sanitize(code, error);
      if (log && failure.status >= 500)
        console.error("API request failed", {
          method: request.method,
          path: logPath(path),
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
        `${request.method} ${logPath(path)} ${set.status ?? 200} ${Math.round(performance.now() - start)}ms`,
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
    .use(
      flows
        ? createFlowRoutes({ flows, identity, versions: flowVersions, chainFactory, log })
        : new Elysia(),
    )
    .use(
      flows && flowVersions
        ? createFlowVersionRoutes({ flows, versions: flowVersions, identity, log })
        : new Elysia(),
    )
    .use(createTriggerIssueRoutes({ flows, triggerIssues, identity }))
    .use(flows ? createPublicRoutes({ flows }) : new Elysia())
    .use(
      dataTables && dataRecords && flows
        ? createDataRoutes({
            dataTables,
            dataRecords,
            flows,
            identity,
            callsPerMinute: limits.data,
          })
        : new Elysia(),
    )
    .use(
      createRunRoutes({
        identity,
        flows,
        runs,
        engine: { model, graph },
        secretsFor,
        chainFactory,
        dataFactory,
        callsPerMinute: limits.runs,
        log,
      }),
    )
    .use(
      flows && runs
        ? createHookRoutes({
            flows,
            runs,
            engine: engineFor,
            chainFactory,
            dataFactory,
            callsPerMinute: limits.webhooks,
          })
        : new Elysia(),
    )
    .use(
      secretsAccess
        ? createSecretRoutes({ identity, ...secretsAccess, callsPerMinute: limits.secrets })
        : new Elysia(),
    )
    .use(
      nodePresets
        ? createNodePresetRoutes({ nodePresets, identity, callsPerMinute: limits.secrets })
        : new Elysia(),
    )
    .use(
      flows && runs && sessions
        ? createSessionRoutes({
            flows,
            runs,
            sessions,
            engine: { model, sandbox, graph },
            secretsFor,
            chainFactory,
            dataFactory,
            callsPerMinute: limits.sessions,
            identity,
            world,
          })
        : new Elysia(),
    )
    .use(createAiRoutes({ identity, model, dataTables, log, callsPerMinute: limits.ai }))
    .use(account ? createAccountRoutes({ account, identity }) : new Elysia())
    .use(
      apiKeys
        ? createApiKeyRoutes({ identity, keys: apiKeys, callsPerMinute: limits.secrets })
        : new Elysia(),
    )
    .use(
      apiKeys && flows && runs
        ? createMachineRoutes({
            verifier: createApiKeyVerifier(apiKeys),
            flows,
            runs,
            engine: engineFor,
            chainFactory,
            dataFactory,
            callsPerMinute: limits.api,
          })
        : new Elysia(),
    )
    .use(createWalletRoutes({ identity, chainFactory, runs }))
    .use(createPaymentPolicyRoutes({ identity, paymentPolicies }))
    .use(
      listings && flows && users
        ? createMarketplaceRoutes({ listings, flows, users, identity, log })
        : new Elysia(),
    )
    .use(
      callableFlows && apiKeys
        ? createMcpRoutes({ source: callableFlows, keys: apiKeys })
        : new Elysia(),
    );
}
