import { getPublicFlowContract } from "@automator/contracts";
import type { FlowStore } from "@automator/db";
import { Elysia } from "elysia";

/**
 * Reads that need no session: once its owner published a flow to the marketplace, anyone
 * may learn its name to host it, but the document itself stays with the API; visitors play
 * the flow through mini-app sessions. Everything else stays behind the auth guard.
 */
export function createPublicRoutes({ flows }: { flows: FlowStore }) {
  return new Elysia({ name: "public" }).get(
    getPublicFlowContract.path,
    async ({ params, status }) => {
      const record = await flows.findPublished(params.id);
      if (!record) return status(404, { error: "not_found" });
      const { id, name, description } = record.flow;
      return { id, name, description, updatedAt: record.updatedAt };
    },
    { params: getPublicFlowContract.params, response: getPublicFlowContract.response },
  );
}
