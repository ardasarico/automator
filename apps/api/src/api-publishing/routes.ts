import {
  invokeApiFlowContract,
  listApiFlowsContract,
  Type,
  type FlowApiResult,
} from "@automator/contracts";
import { Elysia } from "elysia";
import { createRateLimiter, defaultRateLimits } from "../rate-limit";
import { listCallableFlows } from "./callable-flows";
import { createMachineGuard } from "./guard";
import { invokeApiFlow, type InvokeDependencies } from "./invoke";
import type { ApiKeyVerifier } from "./verify";

export interface MachineRouteDependencies extends InvokeDependencies {
  verifier: ApiKeyVerifier | undefined;
  callsPerMinute?: number;
  now?: () => number;
}

/*
 * The machine-facing surface. Everything under /v1 needs an API key and nothing here accepts a
 * dashboard session, so a key that leaks cannot reach an owner's account, only their published
 * flows. There is no web proxy in front of these: a caller reaches the API host directly, which
 * keeps a synchronous run off the 65 s proxy budget.
 */
export function createMachineRoutes({
  verifier,
  flows,
  runs,
  engine,
  chainFactory,
  dataFactory,
  callsPerMinute = defaultRateLimits.api,
  now = Date.now,
}: MachineRouteDependencies) {
  const limiter = createRateLimiter(callsPerMinute, now);
  const dependencies = { flows, runs, engine, chainFactory, dataFactory };
  return new Elysia({ name: "machine-api" })
    .use(createMachineGuard(verifier))
    .get(
      listApiFlowsContract.path,
      async ({ caller }) => ({
        flows: await listCallableFlows(flows, caller.id),
      }),
      { response: listApiFlowsContract.response },
    )
    .post(
      invokeApiFlowContract.path,
      async ({ caller, params, body, status }) => {
        const outcome = await invokeApiFlow(dependencies, {
          ownerId: caller.id,
          flowId: params.id,
          input: body,
        });
        switch (outcome.kind) {
          case "not_found":
            return status(404, { error: "not_found" });
          case "invalid_input":
            return status(422, { error: "invalid_request", problems: outcome.problems });
          case "waiting_on_screen":
            return status(409, { error: "waiting_on_screen" });
          case "ok":
            return status(200, outcome.result satisfies FlowApiResult);
        }
      },
      {
        beforeHandle: ({ caller, set, status }) => {
          if (limiter.allow(caller.id)) return;
          set.headers["Retry-After"] = String(limiter.retryAfter(caller.id));
          return status(429, { error: "rate_limited" });
        },
        params: invokeApiFlowContract.params,
        /* Read loosely so a wrong shape is answered with the declared inputs, not a bare 400. */
        body: Type.Unknown(),
        response: invokeApiFlowContract.response,
      },
    );
}
