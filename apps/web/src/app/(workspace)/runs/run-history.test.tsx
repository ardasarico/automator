/// <reference types="bun" />
import type { FlowRunSummary } from "@automator/contracts";
import { expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { RunHistory } from "./run-history";

const run: FlowRunSummary = {
  id: "run-1",
  flowId: "flow-1",
  flowName: "Ticket checkout",
  status: "succeeded",
  source: "webhook",
  startedAt: "2026-09-07T10:00:00.000Z",
  finishedAt: "2026-09-07T10:00:01.500Z",
};

test("a row links its name to the run page and its icon button to the canvas", () => {
  const html = renderToString(<RunHistory runs={[run]} />);
  expect(html).toContain('href="/runs/run-1"');
  expect(html).toContain('href="/flows/flow-1?run=run-1"');
  expect(html).toContain('aria-label="Open on canvas"');
  expect(html).toContain("Webhook");
  expect(html).toContain("1.5s");
  expect(html).not.toContain("View older runs");
});

test("the next page link appears only when the API minted a cursor", () => {
  const html = renderToString(<RunHistory runs={[run]} nextHref="/runs?flow=flow-1&cursor=abc" />);
  expect(html).toContain("View older runs");
  expect(html).toContain('href="/runs?flow=flow-1&amp;cursor=abc"');
});

test("older pages provide a way to the latest runs without clearing the flow filter", () => {
  const html = renderToString(<RunHistory runs={[run]} latestHref="/runs?flow=flow-1" />);
  expect(html).toContain('aria-label="Run history pages"');
  expect(html).toContain('href="/runs?flow=flow-1"');
  expect(html).toContain("View latest runs");
});

test("an empty cursor page does not claim the flow never ran", () => {
  const html = renderToString(<RunHistory runs={[]} filtered latestHref="/runs?flow=flow-1" />);
  expect(html).toContain("No older runs");
  expect(html).toContain('href="/runs?flow=flow-1"');
  expect(html).toContain("View latest runs");
  expect(html).not.toContain("No runs for this flow yet");
});
