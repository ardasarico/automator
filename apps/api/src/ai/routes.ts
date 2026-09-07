import { generateFlowContract, Type, Value } from "@automator/contracts";
import { LanguageModelError, type LanguageModel } from "@automator/flow-engine";
import { Elysia } from "elysia";
import { createAuthGuard } from "../auth/guard";
import type { IdentityProvider } from "../auth/privy";
import { createRateLimiter, defaultRateLimits } from "../rate-limit";
import { FlowGenerationError, generateFlow } from "./generate-flow";

export interface AiDependencies {
  identity: IdentityProvider | undefined;
  /** Absent when no OpenRouter key is configured; the routes then answer 503. */
  model: LanguageModel | undefined;
  log?: boolean;
  /** AI requests a user may make per minute before 429; ten by default. */
  callsPerMinute?: number;
  now?: () => number;
}

/**
 * `POST /ai/flows` designs or edits a flow document from a prompt, behind the auth guard.
 * Every route of this plugin shares one per-user rate limit, applied before the handler.
 */
export function createAiRoutes({
  identity,
  model,
  log = false,
  callsPerMinute = defaultRateLimits.ai,
  now = Date.now,
}: AiDependencies) {
  const limiter = createRateLimiter(callsPerMinute, now);
  return new Elysia({ name: "ai" })
    .use(createAuthGuard(identity))
    .onBeforeHandle(({ claims, set, status }) => {
      if (limiter.allow(claims.id)) return;
      set.headers["Retry-After"] = String(limiter.retryAfter(claims.id));
      return status(429, { error: "rate_limited" });
    })
    .post(
      generateFlowContract.path,
      async ({ body, status }) => {
        if (!Value.Check(generateFlowContract.body, body))
          return status(400, { error: "invalid_request" });
        if (!model) return status(503, { error: "unavailable" });
        try {
          return await generateFlow(model, body.prompt, body.document);
        } catch (error) {
          if (log)
            console.warn("Flow generation failed", error instanceof Error ? error.message : error);
          if (error instanceof FlowGenerationError) return status(422, { error: "invalid_flow" });
          if (error instanceof LanguageModelError) return status(503, { error: "unavailable" });
          throw error;
        }
      },
      { body: Type.Unknown(), response: generateFlowContract.response },
    );
}
