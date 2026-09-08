import { listTriggerIssuesContract, type TriggerExecutionIssue } from "@automator/contracts";
import type { FlowStore } from "@automator/db";
import { Elysia } from "elysia";
import { createAuthGuard } from "../auth/guard";
import type { IdentityProvider } from "../auth/privy";

export interface TriggerIssueReader {
  listIssues(ownerId: string, flowId: string): Promise<TriggerExecutionIssue[]>;
}

export function createTriggerIssueRoutes({
  flows,
  triggerIssues,
  identity,
}: {
  flows?: Pick<FlowStore, "find">;
  triggerIssues?: TriggerIssueReader;
  identity?: IdentityProvider;
}) {
  return new Elysia({ name: "trigger-issues" }).use(createAuthGuard(identity)).get(
    listTriggerIssuesContract.path,
    async ({ claims, params, status }) => {
      if (!flows) return status(503, { error: "unavailable" });
      if (!(await flows.find(claims.id, params.id))) return status(404, { error: "not_found" });
      if (!triggerIssues) return status(503, { error: "unavailable" });
      return { issues: await triggerIssues.listIssues(claims.id, params.id) };
    },
    { params: listTriggerIssuesContract.params, response: listTriggerIssuesContract.response },
  );
}
