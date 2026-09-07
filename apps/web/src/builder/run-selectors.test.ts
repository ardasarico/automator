import type { FlowRun } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import {
  edgeRunStatus,
  elapsedMs,
  formatElapsed,
  nodeStatusLabel,
  outputHandles,
  simulatedAnswer,
} from "./run-selectors";

const run: FlowRun = {
  id: "r",
  flowId: "f",
  status: "waiting",
  startedAt: "2026-09-07T10:00:00.000Z",
  finishedAt: "2026-09-07T10:00:01.250Z",
  trigger: { nodeId: "open" },
  nodes: [
    { nodeId: "open", status: "succeeded", outputs: { visitor: {} } },
    { nodeId: "check", status: "succeeded", outputs: { false: {} } },
    { nodeId: "members", status: "skipped" },
    { nodeId: "waitlist", status: "waiting" },
  ],
  variables: {},
};

describe("edgeRunStatus", () => {
  test("follows produced output handles", () => {
    expect(
      edgeRunStatus(run, { id: "a", source: "open", target: "check", sourceHandle: "visitor" }),
    ).toBe("fired");
    expect(
      edgeRunStatus(run, { id: "b", source: "check", target: "members", sourceHandle: "true" }),
    ).toBe("dead");
    expect(
      edgeRunStatus(run, { id: "c", source: "check", target: "waitlist", sourceHandle: "false" }),
    ).toBe("fired");
    expect(edgeRunStatus(run, { id: "d", source: "members", target: "x" })).toBe("dead");
    expect(edgeRunStatus(run, { id: "e", source: "waitlist", target: "x" })).toBe("dead");
  });

  test("an edge without a handle fires when the source produced anything", () => {
    expect(edgeRunStatus(run, { id: "f", source: "open", target: "check" })).toBe("fired");
    expect(edgeRunStatus(run, { id: "g", source: "unknown", target: "check" })).toBeUndefined();
    expect(edgeRunStatus(null, { id: "h", source: "open", target: "check" })).toBeUndefined();
  });
});

test("elapsedMs and formatElapsed", () => {
  expect(elapsedMs({ startedAt: run.startedAt, finishedAt: run.finishedAt })).toBe(1250);
  expect(elapsedMs({})).toBeUndefined();
  expect(elapsedMs({ startedAt: "x", finishedAt: "y" })).toBeUndefined();
  expect(formatElapsed(12)).toBe("12 ms");
  expect(formatElapsed(1250)).toBe("1.3 s");
  expect(formatElapsed(42_000)).toBe("42 s");
  expect(formatElapsed(125_000)).toBe("2 min 5 s");
  expect(formatElapsed(120_000)).toBe("2 min");
});

describe("simulated screen answers", () => {
  const answered = {
    nodeId: "page",
    status: "succeeded" as const,
    outputs: { next: {}, simulated: { port: "next" } },
  };

  test("are recognised by the marker and labelled Auto-answered", () => {
    expect(simulatedAnswer(answered)).toEqual({ port: "next" });
    expect(nodeStatusLabel(answered)).toBe("Auto-answered");
    expect(nodeStatusLabel({ status: "succeeded", outputs: { next: {} } })).toBe("Ran");
    expect(nodeStatusLabel({ status: "waiting" })).toBe("Waiting");
    expect(
      simulatedAnswer({ status: "waiting", outputs: { simulated: { port: "next" } } }),
    ).toBeUndefined();
    expect(
      simulatedAnswer({ status: "succeeded", outputs: { simulated: "next" } }),
    ).toBeUndefined();
  });

  test("the marker is not an output handle", () => {
    expect(outputHandles(answered)).toEqual(["next"]);
    const only = {
      ...run,
      nodes: [
        { nodeId: "page", status: "succeeded" as const, outputs: { simulated: { port: "next" } } },
      ],
    };
    expect(edgeRunStatus(only, { id: "a", source: "page", target: "x" })).toBe("dead");
    expect(
      edgeRunStatus(
        { ...run, nodes: [answered] },
        { id: "b", source: "page", target: "x", sourceHandle: "next" },
      ),
    ).toBe("fired");
  });
});
