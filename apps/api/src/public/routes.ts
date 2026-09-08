import { getPublicFlowContract } from "@automator/contracts";
import type { FlowStore } from "@automator/db";
import { Elysia } from "elysia";

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
