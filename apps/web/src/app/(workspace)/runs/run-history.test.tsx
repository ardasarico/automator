/// <reference types="bun" />
import type { FlowRunSummary, FlowSummary } from "@automator/contracts";
import { expect, mock, test } from "bun:test";
import { renderToString } from "react-dom/server";

/* The table reaches for the next page through a server action; rendering it here only needs
 * the action to exist. */
mock.module("server-only", () => ({}));
mock.module("./actions", () => ({ loadMoreRuns: async () => ({ runs: [] }) }));

const { RunHistory } = await import("./run-history");
type RunListState = import("./run-links").RunListState;

const run: FlowRunSummary = {
  id: "run-1",
  flowId: "flow-1",
  flowName: "Ticket checkout",
  status: "succeeded",
  source: "webhook",
  startedAt: "2026-09-07T10:00:00.000Z",
  finishedAt: "2026-09-07T10:00:01.500Z",
};

const state: RunListState = { sort: "started", direction: "desc" };

function render(props: Partial<Parameters<typeof RunHistory>[0]> = {}) {
  return renderToString(<RunHistory runs={[run]} state={state} {...props} />);
}

test("a row opens the run beside the list", () => {
  const html = render();
  expect(html).toContain('href="/runs/run-1"');
  expect(html).toContain("Webhook");
  expect(html).toContain("1.5s");
  expect(html).not.toContain("View older runs");
});

test("the open run is the only row marked current", () => {
  const other: FlowRunSummary = { ...run, id: "run-2", flowName: "Payday" };
  const html = render({ runs: [run, other], selectedId: "run-2" });
  expect(html.match(/aria-current="true"/g)).toHaveLength(1);
  expect(html.slice(html.indexOf("Payday") - 400, html.indexOf("Payday"))).toContain(
    'aria-current="true"',
  );
});

/* The menus themselves open on the client; what the server renders is the heading each one
 * hangs from, and that is what says how the list is ordered. */
test("every column is a menu, and the ordered one is the marked one", () => {
  const html = render({ state: { sort: "duration", direction: "asc" } });
  for (const column of ["Flow", "Status", "Trigger", "Started", "Duration"]) {
    expect(html).toContain(`aria-label="${column} column options"`);
  }
  expect(html.match(/data-active=""/g)).toHaveLength(1);
  const duration = html.indexOf('aria-label="Duration column options"');
  expect(html.slice(duration - 200, duration)).toContain('data-active=""');
});

test("a filtered column says what it is filtered to", () => {
  const flows: FlowSummary[] = [
    {
      id: "flow-1",
      name: "Ticket checkout",
      description: "",
      updatedAt: "2026-09-07T10:00:00.000Z",
      enabled: true,
      triggerTypes: [],
      triggers: [],
      nodeCount: 2,
      outline: { nodes: [], edges: [] },
    },
  ];
  const html = render({ flows, state: { ...state, flowId: "flow-1", status: "failed" } });
  expect(html).toContain('aria-label="Ticket checkout column options"');
  expect(html).not.toContain('aria-label="Flow column options"');
  expect(html).toContain('aria-label="Failed column options"');
  expect(html.match(/data-filtered=""/g)).toHaveLength(2);
});

/* The list grows as it is scrolled, so the end of it is a sentinel rather than a link. The
 * pager's own rules are covered in run-pager.test.ts. */
test("a list with more to come renders nothing to click yet", () => {
  const html = render({ nextCursor: "abc" });
  expect(html).not.toContain("View older runs");
  expect(html).toContain("1 run loaded");
});

test("a page reached by an old cursor link offers the way back to the latest runs", () => {
  const html = render({ state: { ...state, flowId: "flow-1" }, cursor: "page-2" });
  expect(html).toContain('href="/runs?flow=flow-1"');
  expect(html).toContain("View latest runs");
});

test("an empty cursor page does not claim the flow never ran", () => {
  const html = render({ runs: [], state: { ...state, flowId: "flow-1" }, cursor: "page-2" });
  expect(html).toContain("No older runs");
  expect(html).toContain("View latest runs");
  expect(html).not.toContain("No runs for this flow yet");
});

test("a failed run names its reason in the list", () => {
  const failed: FlowRunSummary = {
    ...run,
    status: "failed",
    error: "Discord webhook rejected the message",
  };
  expect(render({ runs: [failed] })).toContain("Discord webhook rejected the message");
});

test("a waiting run reports no duration instead of no time", () => {
  const waiting: FlowRunSummary = { ...run, status: "waiting", finishedAt: run.startedAt };
  const html = render({ runs: [waiting] });
  expect(html).toContain("—");
  expect(html).not.toContain("0.0s");
});

test("an empty status filter says which status came back empty", () => {
  const html = render({ runs: [], state: { ...state, status: "failed" } });
  expect(html).toContain("No failed runs");
  expect(html).not.toContain("No runs for this flow yet");
});
