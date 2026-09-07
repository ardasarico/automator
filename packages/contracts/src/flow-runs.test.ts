import { Value } from "@sinclair/typebox/value";
import { describe, expect, test } from "bun:test";
import { parseResponse } from "./contract";
import { flowRunRequestSchema, flowRunSchema, runFlowContract, type FlowRun } from "./flow-runs";

const run: FlowRun = {
  id: "run-1",
  flowId: "flow-1",
  status: "succeeded",
  startedAt: "2026-09-07T10:00:00.000Z",
  finishedAt: "2026-09-07T10:00:01.000Z",
  trigger: { nodeId: "n1", payload: { hello: "world" } },
  nodes: [
    { nodeId: "n1", status: "succeeded", outputs: { run: { hello: "world" } } },
    { nodeId: "n2", status: "skipped" },
  ],
  variables: {},
};

describe("flow run schema", () => {
  test("accepts a representative run", () => {
    expect(Value.Check(flowRunSchema, run)).toBe(true);
  });

  test("accepts a run without a trigger payload after a JSON round trip", () => {
    const serialized = JSON.parse(JSON.stringify({ ...run, trigger: { nodeId: null } }));
    expect(Value.Check(flowRunSchema, serialized)).toBe(true);
  });

  test("rejects an unknown node status", () => {
    const bad = { ...run, nodes: [{ nodeId: "n1", status: "running" }] };
    expect(Value.Check(flowRunSchema, bad)).toBe(false);
  });
});

describe("run flow contract", () => {
  test("requires a document in the body", () => {
    expect(Value.Check(flowRunRequestSchema, {})).toBe(false);
    expect(
      Value.Check(flowRunRequestSchema, {
        document: { version: 1, id: "f", name: "", description: "", nodes: [], edges: [] },
      }),
    ).toBe(true);
  });

  test("parses a 200 as a run and a 401 as an error", () => {
    expect(parseResponse(runFlowContract, 200, run)).toEqual({ status: 200, data: run });
    expect(parseResponse(runFlowContract, 401, { error: "unauthorized" })).toEqual({
      status: 401,
      data: { error: "unauthorized" },
    });
  });
});
