import { flowChainId, webhookTriggerContract, type WebhookPayload } from "@automator/contracts";
import { Elysia } from "elysia";
import type { ChainFactory } from "../chain/provider";
import type { DataFactory } from "../data/provider";
import { createRateLimiter, defaultRateLimits } from "../rate-limit";
import { executeStoredRun, type EngineOptions, type RunStores } from "../runs/execute";

export interface HookDependencies extends RunStores {
  engine?: EngineOptions | ((ownerId: string) => EngineOptions);
  chainFactory?: ChainFactory;
  dataFactory?: DataFactory;
  callsPerMinute?: number;
  now?: () => number;
}

function webhookPayload(request: Request, body: unknown): WebhookPayload {
  const url = new URL(request.url);
  return {
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    query: Object.fromEntries(url.searchParams.entries()),
    body,
  };
}

export function createHookRoutes({
  flows,
  runs,
  engine,
  chainFactory,
  dataFactory,
  callsPerMinute = defaultRateLimits.webhooks,
  now = Date.now,
}: HookDependencies) {
  const limiter = createRateLimiter(callsPerMinute, now);
  return new Elysia({ name: "hooks" }).post(
    webhookTriggerContract.path,
    async ({ params, request, status, set }) => {
      const owned = await flows.findForWebhook(params.flowId, params.token);
      if (!owned) return status(404, { error: "not_found" });
      const trigger = owned.record.flow.nodes.find((node) => node.type === "trigger.webhook");
      if (!trigger) return status(404, { error: "not_found" });
      if (!limiter.allow(params.flowId)) {
        set.headers["Retry-After"] = String(limiter.retryAfter(params.flowId));
        return status(429, { error: "rate_limited" });
      }
      let body: unknown = null;
      const raw = await request.text();
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
      }
      const shared = typeof engine === "function" ? engine(owned.ownerId) : engine;
      const chain = chainFactory
        ? await chainFactory.forUser(owned.ownerId, "live", flowChainId(owned.record.flow))
        : undefined;
      const data = dataFactory?.forOwner(owned.ownerId, "live");
      const record = await executeStoredRun(
        { flows, runs },
        {
          ownerId: owned.ownerId,
          record: owned.record,
          source: "webhook",
          engine: {
            ...shared,
            ...(chain ? { chain } : {}),
            ...(data ? { data } : {}),
            trigger: { nodeId: trigger.id, payload: webhookPayload(request, body) },
            screens: "wait",
          },
        },
      );
      return status(202, { runId: record.run.id, status: record.run.status });
    },
    // The body is read raw in the handler so non-JSON callers still trigger the flow.
    { params: webhookTriggerContract.params, response: webhookTriggerContract.response },
  );
}
