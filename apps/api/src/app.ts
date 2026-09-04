import {
  apiInfoContract,
  healthContract,
  livenessContract,
  type ApiInfoResponse,
  type LivenessResponse,
} from "@automator/contracts";
import type { createDatabase } from "@automator/db";
import { Elysia } from "elysia";

export function createApp(database: Pick<ReturnType<typeof createDatabase>, "check">) {
  return new Elysia()
    .get(apiInfoContract.path, (): ApiInfoResponse => ({ name: "Automator API" }), {
      response: apiInfoContract.response,
    })
    .get(livenessContract.path, (): LivenessResponse => ({ status: "ok" }), {
      response: livenessContract.response,
    })
    .get(
      healthContract.path,
      async ({ set, status }) => {
        const databaseStatus = await database.check();
        set.headers["Cache-Control"] = "no-store";
        const checkedAt = new Date().toISOString();
        if (databaseStatus === "up") {
          return status(200, {
            status: "ok",
            checks: { api: "up", database: databaseStatus },
            checkedAt,
          });
        }
        return status(503, {
          status: "error",
          checks: { api: "up", database: databaseStatus },
          checkedAt,
        });
      },
      { response: healthContract.response },
    );
}
