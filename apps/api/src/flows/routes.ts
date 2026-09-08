import {
  createFlowContract,
  deleteFlowContract,
  findFlowDocumentProblem,
  getFlowContract,
  isFlowDocumentInput,
  isFlowPatch,
  patchFlowContract,
  listFlowsContract,
  updateFlowContract,
  Type,
} from "@automator/contracts";
import { FlowOwnerMissingError, type FlowStore, type FlowVersionStore } from "@automator/db";
import { Elysia } from "elysia";
import { createAuthGuard } from "../auth/guard";
import type { IdentityProvider } from "../auth/privy";
import { isStoredDocumentValid } from "./stored";

export interface FlowDependencies {
  flows: FlowStore;
  identity: IdentityProvider | undefined;
  /** Save history: version 1 on create, one more per save that changes the graph. */
  versions?: FlowVersionStore;
  /** Names stored documents that fail the schema on the server log; off in tests. */
  log?: boolean;
}

/**
 * Every route is owner-scoped through the auth guard: a flow that exists but belongs to
 * someone else is indistinguishable from a missing one and answers 404.
 */
export function createFlowRoutes({ flows, identity, versions, log = false }: FlowDependencies) {
  return new Elysia({ name: "flows" })
    .use(createAuthGuard(identity))
    .get(listFlowsContract.path, async ({ claims }) => ({ flows: await flows.list(claims.id) }), {
      response: listFlowsContract.response,
    })
    .post(
      createFlowContract.path,
      async ({ claims, body, status }) => {
        // Checked here rather than by the route schema so that a document the client can
        // fix answers 422 `invalid_flow` instead of the generic 400.
        if (!isFlowDocumentInput(body) || findFlowDocumentProblem(body))
          return status(422, { error: "invalid_flow" });
        try {
          const record = await flows.create(claims.id, body, { recordVersion: Boolean(versions) });
          return status(201, record);
        } catch (error) {
          if (error instanceof FlowOwnerMissingError) return status(401, { error: "unauthorized" });
          throw error;
        }
      },
      { body: Type.Unknown(), response: createFlowContract.response },
    )
    .get(
      getFlowContract.path,
      async ({ claims, params, status }) => {
        const record = await flows.find(claims.id, params.id);
        if (!record) return status(404, { error: "not_found" });
        // A document saved before a node type was retired must not take the route down.
        if (!isStoredDocumentValid(record.flow, log)) return status(422, { error: "invalid_flow" });
        return record;
      },
      { params: getFlowContract.params, response: getFlowContract.response },
    )
    .put(
      updateFlowContract.path,
      async ({ claims, params, body, status }) => {
        if (!isFlowDocumentInput(body) || findFlowDocumentProblem(body))
          return status(422, { error: "invalid_flow" });
        // The store saves the graph and its version together under the same flow lock.
        const record = await flows.update(claims.id, params.id, body, {
          recordVersion: Boolean(versions),
        });
        if (!record) return status(404, { error: "not_found" });
        return record;
      },
      {
        params: updateFlowContract.params,
        body: Type.Unknown(),
        response: updateFlowContract.response,
      },
    )
    .patch(
      patchFlowContract.path,
      async ({ claims, params, body, status }) => {
        if (!isFlowPatch(body)) return status(422, { error: "invalid_flow" });
        const record = await flows.setEnabled(claims.id, params.id, body.enabled);
        return record ?? status(404, { error: "not_found" });
      },
      {
        params: patchFlowContract.params,
        body: Type.Unknown(),
        response: patchFlowContract.response,
      },
    )
    .delete(
      deleteFlowContract.path,
      async ({ claims, params, status }) =>
        (await flows.delete(claims.id, params.id))
          ? { id: params.id }
          : status(404, { error: "not_found" }),
      { params: deleteFlowContract.params, response: deleteFlowContract.response },
    );
}
