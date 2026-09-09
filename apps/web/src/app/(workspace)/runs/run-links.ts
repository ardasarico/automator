import {
  isFlowRunStatus,
  isRunSortDirection,
  isRunSortKey,
  runSortDefaults,
  type FlowRunStatus,
  type RunSortDirection,
  type RunSortKey,
} from "@automator/contracts";

/** What the URL says the list is showing, and in what order. */
export type RunListState = {
  flowId?: string;
  status?: FlowRunStatus;
  sort: RunSortKey;
  direction: RunSortDirection;
};

export type RunsSearchParams = {
  flow?: string | string[];
  status?: string | string[];
  cursor?: string | string[];
  sort?: string | string[];
  dir?: string | string[];
};

export function firstParam(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single || undefined;
}

/* Every filter, the order and the page live in the URL, so a list can be linked, bookmarked
 * and navigated back to — and so opening a run keeps the list exactly where it was. The list
 * and the table both build these, which is why they are here rather than on either. */
function query(state: RunListState, cursor?: string): string {
  const params = new URLSearchParams();
  if (state.flowId) params.set("flow", state.flowId);
  if (state.status) params.set("status", state.status);
  if (state.sort !== "started" || state.direction !== runSortDefaults.started) {
    params.set("sort", state.sort);
    params.set("dir", state.direction);
  }
  if (cursor) params.set("cursor", cursor);
  const search = params.toString();
  return search ? `?${search}` : "";
}

export function runsHref(state: RunListState, cursor?: string): string {
  return `/runs${query(state, cursor)}`;
}

/** One run, with the list it was opened from left as it was. */
export function runHref(id: string, state: RunListState, cursor?: string): string {
  return `/runs/${encodeURIComponent(id)}${query(state, cursor)}`;
}

/** The list's state as the URL carries it, with anything unreadable dropped. */
export function readRunListState(params: RunsSearchParams): RunListState {
  const status = firstParam(params.status);
  const sort = firstParam(params.sort);
  const direction = firstParam(params.dir);
  const key = sort !== undefined && isRunSortKey(sort) ? sort : "started";
  return {
    flowId: firstParam(params.flow),
    /* An unreadable status would silently filter everything out, so it is dropped instead. */
    status: status !== undefined && isFlowRunStatus(status) ? status : undefined,
    sort: key,
    direction:
      direction !== undefined && isRunSortDirection(direction) ? direction : runSortDefaults[key],
  };
}
