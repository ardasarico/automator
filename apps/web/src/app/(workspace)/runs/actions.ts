"use server";

import {
  isFlowRunStatus,
  isRunSortDirection,
  isRunSortKey,
  type RunList,
} from "@automator/contracts";
import { requireUser } from "../../../auth/server";
import { listRuns } from "../../../flows/server";

export type MoreRunsInput = {
  cursor: string;
  flowId?: string;
  status?: string;
  sort?: string;
  dir?: string;
};

/**
 * The next page of runs, for the list that fetches as it is scrolled. The API answers for the
 * caller's own runs only, so the worst a made-up argument can do is page a list the reader can
 * already read; anything it cannot understand is dropped rather than guessed at.
 */
export async function loadMoreRuns(input: MoreRunsInput): Promise<RunList> {
  await requireUser();
  if (typeof input.cursor !== "string" || input.cursor === "") return { runs: [] };
  return listRuns({
    cursor: input.cursor,
    flowId: typeof input.flowId === "string" && input.flowId !== "" ? input.flowId : undefined,
    status:
      typeof input.status === "string" && isFlowRunStatus(input.status) ? input.status : undefined,
    sort: typeof input.sort === "string" && isRunSortKey(input.sort) ? input.sort : undefined,
    direction:
      typeof input.dir === "string" && isRunSortDirection(input.dir) ? input.dir : undefined,
  });
}
