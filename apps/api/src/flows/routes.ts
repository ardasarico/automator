import {
  createFlowContract,
  deleteFlowContract,
  findActivationBlockers,
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

/** Matches `maxItems` on the refusal contract; a long list is a wall of text anyway. */
const activationProblemLimit = 50;

export interface FlowDependencies {
  flows: FlowStore;
  identity: IdentityProvider | undefined;
  versions?: FlowVersionStore;
  log?: boolean;
}

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
        // Activation is the last point at which a broken flow can still be stopped: past here the
        // scheduler runs it unattended and the owner only learns from run history. The stored
        // document is checked, not the client's, so a direct API call cannot skip this. Only
        // errors block — a fork blanks every secret, and those warnings are a normal live state.
        // Deactivating is never refused: a live flow must always be switchable off.
        if (body.enabled === true) {
          const stored = await flows.find(claims.id, params.id);
          if (!stored) return status(404, { error: "not_found" });
          const problems = findActivationBlockers(stored.flow).slice(0, activationProblemLimit);
          if (problems.length > 0) return status(422, { error: "invalid_flow", problems });
        }
        let record = null;
        if (body.enabled !== undefined)
          record = await flows.setEnabled(claims.id, params.id, body.enabled);
        if (body.appPublished !== undefined)
          record = await flows.setAppPublished(claims.id, params.id, body.appPublished);
        return record ?? status(404, { error: "not_found" });
      },
      {
        params: patchFlowContract.params,
        body: Type.Unknown(),
        // The contract's 422 carries the problems that blocked activation; Elysia cleans a
        // response to the schema it is given, so they reach the client only because it does.
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
