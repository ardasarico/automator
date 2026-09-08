import {
  createNodePresetContract,
  deleteNodePresetContract,
  isNodePresetInput,
  listNodePresetsContract,
  redactPresetConfig,
  Type,
} from "@automator/contracts";
import {
  NodePresetLimitError,
  NodePresetOwnerMissingError,
  type NodePresetStore,
} from "@automator/db";
import { Elysia } from "elysia";
import { createAuthGuard } from "../auth/guard";
import type { IdentityProvider } from "../auth/privy";
import { createRateLimiter, defaultRateLimits } from "../rate-limit";

export interface NodePresetDependencies {
  nodePresets: NodePresetStore;
  identity: IdentityProvider | undefined;
  callsPerMinute?: number;
  now?: () => number;
}

export function createNodePresetRoutes({
  nodePresets,
  identity,
  callsPerMinute = defaultRateLimits.secrets,
  now = Date.now,
}: NodePresetDependencies) {
  const limiter = createRateLimiter(callsPerMinute, now);
  return new Elysia({ name: "node-presets" })
    .use(createAuthGuard(identity))
    .get(
      listNodePresetsContract.path,
      async ({ claims }) => ({ presets: await nodePresets.list(claims.id) }),
      { response: listNodePresetsContract.response },
    )
    .post(
      createNodePresetContract.path,
      async ({ claims, body, status }) => {
        // Checked here rather than by the route schema so a fixable preset answers 422, not 400.
        if (!isNodePresetInput(body)) return status(422, { error: "invalid_request" });
        try {
          const preset = await nodePresets.create(claims.id, {
            ...body,
            // A preset carries `{{secrets.name}}` references, never the credential itself.
            config: redactPresetConfig(body.type, body.config),
          });
          return status(201, preset);
        } catch (error) {
          if (error instanceof NodePresetLimitError) return status(409, { error: "conflict" });
          if (error instanceof NodePresetOwnerMissingError)
            return status(401, { error: "unauthorized" });
          throw error;
        }
      },
      {
        beforeHandle: ({ claims, set, status }) => {
          if (limiter.allow(claims.id)) return;
          set.headers["Retry-After"] = String(limiter.retryAfter(claims.id));
          return status(429, { error: "rate_limited" });
        },
        body: Type.Unknown(),
        response: createNodePresetContract.response,
      },
    )
    .delete(
      deleteNodePresetContract.path,
      async ({ claims, params, status }) =>
        (await nodePresets.remove(claims.id, params.id))
          ? { id: params.id }
          : status(404, { error: "not_found" }),
      {
        beforeHandle: ({ claims, set, status }) => {
          if (limiter.allow(claims.id)) return;
          set.headers["Retry-After"] = String(limiter.retryAfter(claims.id));
          return status(429, { error: "rate_limited" });
        },
        params: deleteNodePresetContract.params,
        response: deleteNodePresetContract.response,
      },
    );
}
