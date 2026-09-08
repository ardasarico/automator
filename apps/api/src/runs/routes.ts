import {
  flowChainId,
  getRunContract,
  listAllRunsContract,
  listRunsContract,
  parseRunListLimit,
  runFlowContract,
  runSavedFlowContract,
  Type,
  Value,
  type RunListQuery,
} from "@automator/contracts";
import { RunCursorError, type FlowStore, type RunStore } from "@automator/db";
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
  callsPerMinute?: number;
  now?: () => number;
  engine?: Pick<RunOptions, "fetch" | "sleep" | "executors" | "model">;
  secretsFor?: (ownerId: string) => SecretsResolver;
  chainFactory?: ChainFactory;
  sandbox?: Sandbox;
  flows?: FlowStore;
  runs?: RunStore;
  log?: boolean;
}

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
  const listPage = async (ownerId: string, query: RunListQuery) => {
    const limit = parseRunListLimit(query.limit);
    if (limit === null) return null;
    try {
      return await stores.runs.list(ownerId, { flowId: query.flowId, cursor: query.cursor, limit });
    } catch (error) {
      if (error instanceof RunCursorError) return null;
      throw error;
    }
  };
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
      async ({ claims, params, query, status }) => {
        if (!(await stores.flows.find(claims.id, params.id)))
          return status(404, { error: "not_found" });
        const page = await listPage(claims.id, { ...query, flowId: params.id });
        return page ?? status(400, { error: "invalid_request" });
      },
      {
        params: listRunsContract.params,
        query: listRunsContract.query,
        response: listRunsContract.response,
      },
    )
    .get(
      listAllRunsContract.path,
      async ({ claims, query, status }) => {
        const page = await listPage(claims.id, query);
        return page ?? status(400, { error: "invalid_request" });
      },
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
