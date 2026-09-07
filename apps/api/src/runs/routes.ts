import {
  flowChainId,
  getRunContract,
  listAllRunsContract,
  listRunsContract,
  runFlowContract,
  runSavedFlowContract,
  Type,
  Value,
} from "@automator/contracts";
import type { FlowStore, RunStore } from "@automator/db";
import {
  runFlow,
  type RunOptions,
  type Sandbox,
  type SecretsResolver,
} from "@automator/flow-engine";
import { Elysia } from "elysia";
import { createAuthGuard } from "../auth/guard";
import { isStoredDocumentValid } from "../flows/stored";
import { createQuickJsSandbox } from "../sandbox/quickjs";
import type { IdentityProvider } from "../auth/privy";
import type { ChainFactory } from "../chain/provider";
import { createRateLimiter, defaultRateLimits } from "../rate-limit";
import { executeStoredRun } from "./execute";

export interface RunDependencies {
  identity: IdentityProvider | undefined;
  /** Runs a user may start per minute before 429; thirty by default. */
  callsPerMinute?: number;
  now?: () => number;
  /** Engine overrides, used by tests to replace network and timers. */
  engine?: Pick<RunOptions, "fetch" | "sleep" | "executors" | "model">;
  /** The caller's `{{secrets.*}}`, decrypted per run; absent when secrets are not configured. */
  secretsFor?: (ownerId: string) => SecretsResolver;
  /** Chains for onchain nodes, per user and mode; absent when no provider is configured. */
  chainFactory?: ChainFactory;
  /** Where `logic.run-code` evaluates; the QuickJS sandbox unless a test replaces it. */
  sandbox?: Sandbox;
  /** Without both stores only the stateless run exists. */
  flows?: FlowStore;
  runs?: RunStore;
  /** Names stored documents that fail the schema on the server log; off in tests. */
  log?: boolean;
}

/**
 * `POST /flows/run` runs any document the caller sends and stores nothing: the canvas uses it
 * for unsaved work. `POST /flows/:id/runs` runs the caller's saved flow and records the run,
 * and the read routes list and fetch those records, all owner-scoped.
 */
export function createRunRoutes({
  identity,
  engine,
  flows,
  runs,
  secretsFor,
  chainFactory,
  sandbox = createQuickJsSandbox(),
  callsPerMinute = defaultRateLimits.runs,
  now = Date.now,
  log = false,
}: RunDependencies) {
  // Both run routes share one per-user window; the read routes are not limited.
  const limiter = createRateLimiter(callsPerMinute, now);
  const app = new Elysia({ name: "runs" }).use(createAuthGuard(identity)).post(
    runFlowContract.path,
    async ({ claims, body, status, request }) => {
      // Checked in the handler, after the guard, so an anonymous caller always sees 401.
      if (!Value.Check(runFlowContract.body, body))
        return status(400, { error: "invalid_request" });
      const chain = chainFactory
        ? await chainFactory.forUser(claims.id, body.mode ?? "dry-run", flowChainId(body.document))
        : undefined;
      // A client that disconnects (Stop in the builder) cancels the run it started.
      return runFlow(body.document, {
        ...engine,
        trigger: body.trigger,
        screens: body.screens,
        signal: request.signal,
        secrets: secretsFor?.(claims.id),
        sandbox,
        ...(chain ? { chain } : {}),
      });
    },
    {
      beforeHandle: ({ claims, set, status }) => {
        if (limiter.allow(claims.id)) return;
        set.headers["Retry-After"] = String(limiter.retryAfter(claims.id));
        return status(429, { error: "rate_limited" });
      },
      body: Type.Unknown(),
      response: runFlowContract.response,
    },
  );
  if (!flows || !runs) return app;
  const stores = { flows, runs };
  return app
    .post(
      runSavedFlowContract.path,
      async ({ claims, params, body, status, request }) => {
        if (!Value.Check(runSavedFlowContract.body, body))
          return status(400, { error: "invalid_request" });
        const record = await stores.flows.find(claims.id, params.id);
        if (!record) return status(404, { error: "not_found" });
        if (!isStoredDocumentValid(record.flow, log)) return status(422, { error: "invalid_flow" });
        const chain = chainFactory
          ? await chainFactory.forUser(claims.id, body.mode ?? "dry-run", flowChainId(record.flow))
          : undefined;
        const stored = await executeStoredRun(stores, {
          ownerId: claims.id,
          record,
          source: "manual",
          engine: {
            ...(chain ? { chain } : {}),
            ...engine,
            trigger: body.trigger,
            screens: body.screens,
            signal: request.signal,
            secrets: secretsFor?.(claims.id),
            sandbox,
          },
        });
        return status(201, stored);
      },
      {
        beforeHandle: ({ claims, set, status }) => {
          if (limiter.allow(claims.id)) return;
          set.headers["Retry-After"] = String(limiter.retryAfter(claims.id));
          return status(429, { error: "rate_limited" });
        },
        params: runSavedFlowContract.params,
        body: Type.Unknown(),
        response: runSavedFlowContract.response,
      },
    )
    .get(
      listRunsContract.path,
      async ({ claims, params, status }) => {
        if (!(await stores.flows.find(claims.id, params.id)))
          return status(404, { error: "not_found" });
        return { runs: await stores.runs.list(claims.id, { flowId: params.id }) };
      },
      { params: listRunsContract.params, response: listRunsContract.response },
    )
    .get(
      listAllRunsContract.path,
      async ({ claims, query }) => ({
        runs: await stores.runs.list(claims.id, { flowId: query.flowId }),
      }),
      {
        query: listAllRunsContract.query,
        response: listAllRunsContract.response,
      },
    )
    .get(
      getRunContract.path,
      async ({ claims, params, status }) => {
        const record = await stores.runs.find(claims.id, params.id);
        if (!record) return status(404, { error: "not_found" });
        // The run keeps the document it executed; an old snapshot must still read as a run.
        if (!isStoredDocumentValid(record.document, log))
          return status(422, { error: "invalid_flow" });
        return record;
      },
      { params: getRunContract.params, response: getRunContract.response },
    );
}
