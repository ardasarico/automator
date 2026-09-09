import type { FlowRunSummary, RunList } from "@automator/contracts";

/**
 * How many pages the list fetches on its own before it starts asking. Scrolling should not
 * quietly pull a thousand rows, so after this the reader presses a button for each page.
 */
export const autoLoadBudget = 3;

export type RunPage = {
  runs: readonly FlowRunSummary[];
  cursor: string | undefined;
  /** Pages fetched since the list was rendered, which the auto-load budget counts. */
  loads: number;
};

/**
 * The next page, added to what is already on screen. A run that arrived twice — the same run
 * can sit on two pages if one was written between the requests — is kept once.
 */
export function appendPage(current: RunPage, page: RunList): RunPage {
  const seen = new Set(current.runs.map((run) => run.id));
  return {
    runs: [...current.runs, ...page.runs.filter((run) => !seen.has(run.id))],
    cursor: page.nextCursor,
    loads: current.loads + 1,
  };
}

/** Whether the list may still fetch the next page by itself. */
export function canAutoLoad(page: RunPage): boolean {
  return page.cursor !== undefined && page.loads < autoLoadBudget;
}

/**
 * Whether a remembered list still belongs to what the server just sent. The pages a reader
 * scrolled through are kept while a run is opened beside them, but a list that has moved on —
 * a new run at the top, a deleted one — starts again rather than showing a stale first page.
 */
export function matchesServerPage(
  remembered: RunPage,
  serverRuns: readonly FlowRunSummary[],
): boolean {
  if (remembered.runs.length < serverRuns.length) return false;
  return serverRuns.every((run, index) => remembered.runs[index]?.id === run.id);
}
