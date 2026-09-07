import { flowChainId, webhookTriggerContract, type WebhookPayload } from "@automator/contracts";
import { Elysia } from "elysia";
import type { ChainFactory } from "../chain/provider";
import { executeStoredRun, type EngineOptions, type RunStores } from "../runs/execute";

export interface HookDependencies extends RunStores {
  /** Engine options every hook run shares (model, fetch, executors, secrets factory). */
  engine?: EngineOptions | ((ownerId: string) => EngineOptions);
  /** Trigger-driven runs are live: real chains, never dry runs. */
  chainFactory?: ChainFactory;
  /** Calls allowed per flow per minute before 429; sixty by default. */
  callsPerMinute?: number;
  now?: () => number;
}

/** A sliding one-minute window per flow, in memory: enough for one API instance. */
export function createRateLimiter(limit: number, now: () => number = Date.now) {
  const calls = new Map<string, number[]>();
  return {
    allow(key: string): boolean {
      const cutoff = now() - 60_000;
      const recent = (calls.get(key) ?? []).filter((at) => at > cutoff);
      if (recent.length >= limit) {
        calls.set(key, recent);
        return false;
      }
      recent.push(now());
      calls.set(key, recent);
      return true;
    },
  };
}

/** Headers are lowercased by the runtime; the query is the first value per key. */
export function webhookPayload(request: Request, body: unknown): WebhookPayload {
  const url = new URL(request.url);
  return {
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    query: Object.fromEntries(url.searchParams.entries()),
    body,
  };
}

/**
 * The public webhook entry: no session, the flow's token is the credential. The flow runs
 * synchronously from its webhook trigger with the request as payload, stops at screens, and
 * the stored run's id and status come back. Every refusal is a 404 so tokens cannot be probed.
 */
export function createHookRoutes({
  flows,
  runs,
  engine,
  chainFactory,
  callsPerMinute = 60,
  now = Date.now,
}: HookDependencies) {
  const limiter = createRateLimiter(callsPerMinute, now);
  return new Elysia({ name: "hooks" }).post(
    webhookTriggerContract.path,
    async ({ params, request, status }) => {
      const owned = await flows.findForWebhook(params.flowId, params.token);
      if (!owned) return status(404, { error: "not_found" });
      const trigger = owned.record.flow.nodes.find((node) => node.type === "trigger.webhook");
      if (!trigger) return status(404, { error: "not_found" });
      if (!limiter.allow(params.flowId)) return status(429, { error: "rate_limited" });
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
      const record = await executeStoredRun(
        { flows, runs },
        {
          ownerId: owned.ownerId,
          record: owned.record,
          source: "webhook",
          engine: {
            ...shared,
            ...(chain ? { chain } : {}),
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
