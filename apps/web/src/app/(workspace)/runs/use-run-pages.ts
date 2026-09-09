"use client";

import type { FlowRunSummary } from "@automator/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadMoreRuns, type MoreRunsInput } from "./actions";
import { appendPage, canAutoLoad, matchesServerPage, type RunPage } from "./run-pager";

/**
 * The pages a reader has scrolled through, per list. Opening a run re-renders the list beside
 * it, which would otherwise throw away everything below the first page; this keeps it for as
 * long as the tab lives, and a different order or filter is a different list.
 */
const remembered = new Map<string, RunPage>();

export type RunPagesQuery = Omit<MoreRunsInput, "cursor">;

/**
 * A run list that grows as it is scrolled. The first page is the server's; every page after it
 * is fetched on demand, and after a few of them the list waits to be asked.
 */
export function useRunPages({
  listKey,
  runs,
  cursor,
  query,
}: {
  listKey: string;
  runs: readonly FlowRunSummary[];
  cursor: string | undefined;
  query: RunPagesQuery;
}) {
  const seed = (): RunPage => {
    const kept = remembered.get(listKey);
    return kept && matchesServerPage(kept, runs) ? kept : { runs, cursor, loads: 0 };
  };
  const [page, setPage] = useState<RunPage>(seed);
  /* What the server last sent. When that changes, the grown list belongs to a page that is
   * gone, so it starts again — adjusted during render rather than in an effect. */
  const [source, setSource] = useState({ listKey, top: runs[0]?.id, length: runs.length });
  if (source.listKey !== listKey || source.top !== runs[0]?.id || source.length !== runs.length) {
    setSource({ listKey, top: runs[0]?.id, length: runs.length });
    setPage(seed());
  }

  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  /* One request at a time: the sentinel can cross the viewport twice before a page lands. */
  const busy = useRef(false);

  useEffect(() => {
    remembered.set(listKey, page);
  }, [listKey, page]);

  const queryKey = JSON.stringify(query);
  const next = page.cursor;
  const load = useCallback(async () => {
    if (next === undefined || busy.current) return;
    busy.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const fetched = await loadMoreRuns({
        ...(JSON.parse(queryKey) as RunPagesQuery),
        cursor: next,
      });
      setPage((current) => appendPage(current, fetched));
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [next, queryKey]);

  const sentinel = useRef<HTMLDivElement>(null);
  const auto = canAutoLoad(page) && !failed;
  useEffect(() => {
    const node = sentinel.current;
    /* No observer, no automatic loading: the button below the list still works. */
    if (!node || !auto || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void load();
      },
      /* Ahead of the last row, so the next page is usually there before it is reached. */
      { rootMargin: "600px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [auto, load]);

  return {
    runs: page.runs,
    loading,
    failed,
    /* More to fetch, but the list has stopped fetching for itself. */
    more: page.cursor !== undefined,
    auto,
    load,
    sentinel,
  };
}
