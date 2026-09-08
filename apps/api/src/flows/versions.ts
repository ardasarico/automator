import { getFlowVersionContract, listFlowVersionsContract } from "@automator/contracts";
import type { FlowStore, FlowVersionStore } from "@automator/db";
import { Elysia } from "elysia";
import { createAuthGuard } from "../auth/guard";
import type { IdentityProvider } from "../auth/privy";
import { isStoredDocumentValid } from "./stored";

export interface FlowVersionDependencies {
  flows: FlowStore;
  versions: FlowVersionStore;
  identity: IdentityProvider | undefined;
  /** Names stored documents that fail the schema on the server log; off in tests. */
  log?: boolean;
}

/** The positive integer a `:number` segment names, or `null` for anything else. */
function parseNumber(segment: string): number | null {
  return /^[1-9][0-9]*$/.test(segment) ? Number.parseInt(segment, 10) : null;
}

/**
 * Read routes for a flow's save history, owner-scoped through the auth guard: a flow that
 * is someone else's is indistinguishable from a missing one and answers 404, as does a
 * version number the flow never reached or has pruned.
 */
export function createFlowVersionRoutes({
  flows,
  versions,
  identity,
  log = false,
}: FlowVersionDependencies) {
  return new Elysia({ name: "flow-versions" })
    .use(createAuthGuard(identity))
    .get(
      listFlowVersionsContract.path,
      async ({ claims, params, status }) => {
        if (!(await flows.find(claims.id, params.id))) return status(404, { error: "not_found" });
        return { versions: await versions.list(claims.id, params.id) };
      },
      { params: listFlowVersionsContract.params, response: listFlowVersionsContract.response },
    )
    .get(
      getFlowVersionContract.path,
      async ({ claims, params, status }) => {
        const number = parseNumber(params.number);
        const record = number === null ? null : await versions.find(claims.id, params.id, number);
        if (!record) return status(404, { error: "not_found" });
        // A version saved before a node type was retired must not take the route down.
        if (!isStoredDocumentValid(record.document, log))
          return status(422, { error: "invalid_flow" });
        return record;
      },
      { params: getFlowVersionContract.params, response: getFlowVersionContract.response },
    );
}
