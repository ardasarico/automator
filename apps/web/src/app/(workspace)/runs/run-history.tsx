"use client";

import {
  flowRunStatuses,
  type FlowRunStatus,
  type FlowRunSummary,
  type FlowSummary,
  type RunSortKey,
} from "@automator/contracts";
import { Badge } from "@automator/ui/badge";
import { Button } from "@automator/ui/button";
import { Menu, MenuLinkItem, MenuPopup, MenuSeparator, MenuTrigger } from "@automator/ui/menu";
import { RiArrowDownSLine, RiArrowUpSLine, RiCheckLine, RiPlayCircleLine } from "@remixicon/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { LocalTime } from "./local-time";
import { runDuration, runSourceLabels, runStatusLabels } from "./run-labels";
import { runHref, runsHref, type RunListState } from "./run-links";
import styles from "./runs.module.css";
import { useRunPages } from "./use-run-pages";
import { EmptyState } from "../../../components/empty-state";

/* Each column says what its own order means, rather than repeating "ascending". */
const sortWords: Record<RunSortKey, { asc: string; desc: string }> = {
  started: { desc: "Newest first", asc: "Oldest first" },
  flow: { asc: "Name A–Z", desc: "Name Z–A" },
  status: { asc: "Status A–Z", desc: "Status Z–A" },
  trigger: { asc: "Trigger A–Z", desc: "Trigger Z–A" },
  duration: { desc: "Longest first", asc: "Shortest first" },
};

function emptyCopy(status: FlowRunStatus | undefined, filtered: boolean, older: boolean) {
  if (older)
    return {
      title: "No older runs",
      body: "There are no runs on this page. Return to the latest runs to see recent activity.",
    };
  if (status)
    return {
      title: `No ${runStatusLabels[status].label.toLowerCase()} runs`,
      body: "Nothing here matches that status. Clear the filter to see every run.",
    };
  if (filtered)
    return {
      title: "No runs for this flow yet",
      body: "Runs appear here once Simulate, a webhook call, the schedule or an onchain event starts this flow.",
    };
  return {
    title: "No runs yet",
    body: "Save a flow and press Simulate on its canvas. Every run of a saved flow is kept here.",
  };
}

/**
 * A column heading that carries its own order, and — where the API can filter by it — its own
 * filter. The toolbar those controls used to live on is gone: they belong to the column they
 * act on, and every one of them is a link, so the list stays server-rendered.
 */
function ColumnHeader({
  column,
  label,
  state,
  filter,
  filtered = false,
  className,
}: {
  column: RunSortKey;
  label: string;
  state: RunListState;
  filter?: ReactNode;
  filtered?: boolean;
  className?: string;
}) {
  const active = state.sort === column;
  const words = sortWords[column];
  return (
    <th scope="col" className={className}>
      <Menu>
        <MenuTrigger
          className={styles.columnTrigger}
          data-active={active ? "" : undefined}
          data-filtered={filtered ? "" : undefined}
          aria-label={`${label} column options`}
        >
          {label}
          {active ? (
            state.direction === "asc" ? (
              <RiArrowUpSLine aria-hidden="true" className={styles.columnMark} />
            ) : (
              <RiArrowDownSLine aria-hidden="true" className={styles.columnMark} />
            )
          ) : (
            <RiArrowDownSLine aria-hidden="true" className={styles.columnCaret} />
          )}
        </MenuTrigger>
        <MenuPopup align="start">
          <ChoiceItem
            href={runsHref({ ...state, sort: column, direction: "desc" })}
            active={active && state.direction === "desc"}
          >
            {words.desc}
          </ChoiceItem>
          <ChoiceItem
            href={runsHref({ ...state, sort: column, direction: "asc" })}
            active={active && state.direction === "asc"}
          >
            {words.asc}
          </ChoiceItem>
          {filter}
        </MenuPopup>
      </Menu>
    </th>
  );
}

/** A menu choice that says whether it is the one in effect. */
function ChoiceItem({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <MenuLinkItem
      render={<Link href={href} scroll={false} />}
      className={styles.choiceItem}
      data-checked={active ? "" : undefined}
      aria-current={active ? "true" : undefined}
    >
      <RiCheckLine aria-hidden="true" className={styles.choiceMark} />
      <span>{children}</span>
    </MenuLinkItem>
  );
}

export function RunHistory({
  runs: serverRuns,
  flows = [],
  state,
  cursor,
  nextCursor,
  selectedId,
}: {
  runs: readonly FlowRunSummary[];
  flows?: readonly FlowSummary[];
  state: RunListState;
  /** The page the server rendered, if the URL asked for one past the first. */
  cursor?: string;
  nextCursor?: string;
  selectedId?: string;
}) {
  /* A different order, filter or starting page is a different list. */
  const { runs, loading, failed, more, auto, load, sentinel } = useRunPages({
    listKey: runsHref(state, cursor),
    runs: serverRuns,
    cursor: nextCursor,
    query: {
      flowId: state.flowId,
      status: state.status,
      sort: state.sort,
      dir: state.direction,
    },
  });
  const latestHref = cursor ? runsHref(state) : undefined;
  const filtered = Boolean(state.flowId) || Boolean(state.status);
  if (runs.length === 0) {
    const copy = emptyCopy(state.status, filtered, Boolean(latestHref));
    return (
      <EmptyState
        icon={<RiPlayCircleLine />}
        titleId="runs-empty-title"
        title={copy.title}
        text={copy.body}
        action={
          <Button
            variant="outline"
            render={<Link href={latestHref ?? (filtered ? "/runs" : "/flows")} />}
          >
            {latestHref ? "View latest runs" : filtered ? "Show all runs" : "Go to flows"}
          </Button>
        }
      />
    );
  }
  const selectedFlow = flows.find((flow) => flow.id === state.flowId);
  return (
    <section aria-label="Recent runs">
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className="sr-only">
            Your runs, ordered by {sortWords[state.sort][state.direction].toLowerCase()}
          </caption>
          <thead>
            <tr>
              <ColumnHeader
                column="flow"
                label={selectedFlow ? selectedFlow.name : "Flow"}
                filtered={Boolean(state.flowId)}
                state={state}
                filter={
                  <>
                    <MenuSeparator />
                    <ChoiceItem
                      href={runsHref({ ...state, flowId: undefined })}
                      active={!state.flowId}
                    >
                      All flows
                    </ChoiceItem>
                    {flows.map((flow) => (
                      <ChoiceItem
                        key={flow.id}
                        href={runsHref({ ...state, flowId: flow.id })}
                        active={flow.id === state.flowId}
                      >
                        {flow.name}
                      </ChoiceItem>
                    ))}
                  </>
                }
              />
              <ColumnHeader
                column="status"
                /* A filtered column says what it is filtered to, in place of its own name. */
                label={state.status ? runStatusLabels[state.status].label : "Status"}
                filtered={Boolean(state.status)}
                className={styles.status}
                state={state}
                filter={
                  <>
                    <MenuSeparator />
                    <ChoiceItem
                      href={runsHref({ ...state, status: undefined })}
                      active={!state.status}
                    >
                      Any status
                    </ChoiceItem>
                    {flowRunStatuses.map((value) => (
                      <ChoiceItem
                        key={value}
                        href={runsHref({ ...state, status: value })}
                        active={value === state.status}
                      >
                        {runStatusLabels[value].label}
                      </ChoiceItem>
                    ))}
                  </>
                }
              />
              <ColumnHeader
                column="trigger"
                label="Trigger"
                className={styles.trigger}
                state={state}
              />
              <ColumnHeader
                column="started"
                label="Started"
                className={styles.started}
                state={state}
              />
              <ColumnHeader
                column="duration"
                label="Duration"
                className={styles.duration}
                state={state}
              />
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const badge = runStatusLabels[run.status];
              const duration = runDuration(run.status, run.startedAt, run.finishedAt);
              return (
                <tr key={run.id} aria-current={run.id === selectedId ? "true" : undefined}>
                  <th scope="row">
                    <Link
                      href={runHref(run.id, state, cursor)}
                      scroll={false}
                      className={styles.runLink}
                      aria-label={`${run.flowName} run`}
                    >
                      {run.flowName}
                    </Link>
                    {/* The reason a failure happened, so the list answers it without a click. */}
                    {run.status === "failed" && run.error && (
                      <p className={styles.reason} title={run.error}>
                        {run.error}
                      </p>
                    )}
                  </th>
                  <td className={styles.status}>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </td>
                  <td className={styles.trigger}>{runSourceLabels[run.source]}</td>
                  <td className={styles.started}>
                    <LocalTime value={run.startedAt} zone={false} />
                  </td>
                  <td className={styles.duration}>
                    {duration ?? <span className={styles.pending}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* The list fetches as it is scrolled, then asks: nothing here moves the page under a
       * reader who is still reading, and a failure offers the same page again. */}
      <div ref={sentinel} className={styles.pageEnd}>
        {failed ? (
          <>
            <p className={styles.pageNote}>Those runs did not load.</p>
            <Button variant="outline" onClick={() => void load()} loading={loading}>
              Try again
            </Button>
          </>
        ) : more && !auto ? (
          <Button variant="outline" onClick={() => void load()} loading={loading}>
            Load older runs
          </Button>
        ) : loading ? (
          <p className={styles.pageNote}>Loading older runs…</p>
        ) : null}
        {latestHref && (
          <Button variant="outline" render={<Link href={latestHref} />}>
            View latest runs
          </Button>
        )}
      </div>
      <p aria-live="polite" className="sr-only">
        {loading
          ? "Loading older runs"
          : `${runs.length} ${runs.length === 1 ? "run" : "runs"} loaded`}
      </p>
    </section>
  );
}
