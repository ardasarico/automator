import type { FlowRunSummary } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { appendPage, autoLoadBudget, canAutoLoad, matchesServerPage } from "./run-pager";

function run(id: string): FlowRunSummary {
  return {
    id,
    flowId: "flow-1",
    flowName: "Ticket checkout",
    status: "succeeded",
    source: "webhook",
    startedAt: "2026-09-07T10:00:00.000Z",
    finishedAt: "2026-09-07T10:00:01.000Z",
  };
}

const first = { runs: [run("a"), run("b")], cursor: "next", loads: 0 };

describe("appendPage", () => {
  test("adds the page and carries its cursor", () => {
    const next = appendPage(first, { runs: [run("c")], nextCursor: "further" });
    expect(next.runs.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    expect(next.cursor).toBe("further");
    expect(next.loads).toBe(1);
  });

  test("keeps a run that arrived on two pages once", () => {
    const next = appendPage(first, { runs: [run("b"), run("c")] });
    expect(next.runs.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    expect(next.cursor).toBeUndefined();
  });
});

describe("canAutoLoad", () => {
  test("stops at the end of the list", () => {
    expect(canAutoLoad({ ...first, cursor: undefined })).toBe(false);
  });

  test("stops asking for itself once the budget is spent", () => {
    expect(canAutoLoad({ ...first, loads: autoLoadBudget - 1 })).toBe(true);
    expect(canAutoLoad({ ...first, loads: autoLoadBudget })).toBe(false);
  });
});

describe("matchesServerPage", () => {
  test("keeps the scrolled pages while a run is open beside them", () => {
    const scrolled = { runs: [run("a"), run("b"), run("c")], cursor: "next", loads: 1 };
    expect(matchesServerPage(scrolled, [run("a"), run("b")])).toBe(true);
  });

  test("starts again when the list has moved on", () => {
    const scrolled = { runs: [run("a"), run("b"), run("c")], cursor: "next", loads: 1 };
    expect(matchesServerPage(scrolled, [run("new"), run("a")])).toBe(false);
    expect(
      matchesServerPage({ runs: [run("a")], cursor: undefined, loads: 0 }, [run("a"), run("b")]),
    ).toBe(false);
  });
});
