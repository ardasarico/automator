import { expect, test } from "bun:test";
import { readRunListState, runHref, runsHref } from "./run-links";

test("the URL carries the filters and the order, and leaves the default order out", () => {
  const state = readRunListState({ flow: "flow-1", status: "failed" });
  expect(state).toEqual({ flowId: "flow-1", status: "failed", sort: "started", direction: "desc" });
  expect(runsHref(state)).toBe("/runs?flow=flow-1&status=failed");
  expect(runsHref({ ...state, sort: "duration", direction: "desc" })).toBe(
    "/runs?flow=flow-1&status=failed&sort=duration&dir=desc",
  );
  expect(runHref("run 1", state, "cursor-1")).toBe(
    "/runs/run%201?flow=flow-1&status=failed&cursor=cursor-1",
  );
});

test("an order the API does not have falls back to the newest runs", () => {
  expect(readRunListState({ sort: "colour", dir: "sideways" })).toEqual({
    flowId: undefined,
    status: undefined,
    sort: "started",
    direction: "desc",
  });
  /* A column with no direction of its own takes the one that column means by default. */
  expect(readRunListState({ sort: "flow" })).toMatchObject({ sort: "flow", direction: "asc" });
  expect(readRunListState({ sort: "duration" })).toMatchObject({
    sort: "duration",
    direction: "desc",
  });
});

test("an unreadable status is dropped rather than filtering everything out", () => {
  expect(readRunListState({ status: "exploded" })).toMatchObject({ status: undefined });
});
