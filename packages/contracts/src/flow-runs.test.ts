import { Value } from "@sinclair/typebox/value";
import { describe, expect, test } from "bun:test";
import { parseResponse } from "./contract";
import {
  flowRunNodeResultSchema,
  flowRunRequestSchema,
  flowRunSchema,
  flowRunSourceSchema,
  flowRunSources,
  listAllRunsContract,
  listRunsContract,
  parseRunListLimit,
  runFlowContract,
  runListMaxLimit,
  runListSchema,
  transactionHashes,
  type FlowRun,
} from "./flow-runs";

describe("flowRunNodeResultSchema", () => {
  test("a skipped node may say why, and a run recorded before the reason existed still validates", () => {
    expect(Value.Check(flowRunNodeResultSchema, { nodeId: "n1", status: "skipped" })).toBe(true);
    for (const skipReason of ["no-input", "run-stopped"])
      expect(
        Value.Check(flowRunNodeResultSchema, { nodeId: "n1", status: "skipped", skipReason }),
      ).toBe(true);
    expect(
      Value.Check(flowRunNodeResultSchema, { nodeId: "n1", status: "skipped", skipReason: "why" }),
    ).toBe(false);
  });
});

describe("transactionHashes", () => {
  const hash = `0x${"ab".repeat(32)}`;
  test("finds a receipt's hash at the top level or one level down, once", () => {
    expect(transactionHashes({ hash, status: "success" })).toEqual([hash]);
    expect(transactionHashes({ receipt: { transactionHash: hash }, hash })).toEqual([hash]);
    expect(transactionHashes({ token: "0xabc", hash: "not a hash" })).toEqual([]);
    expect(transactionHashes({ deep: { deeper: { hash } } })).toEqual([]);
    expect(transactionHashes("text")).toEqual([]);
    expect(transactionHashes(undefined)).toEqual([]);
  });
});

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

describe("run sources", () => {
  test("include the onchain-event listener", () => {
    for (const source of ["manual", "webhook", "schedule", "miniapp", "event"])
      expect(Value.Check(flowRunSourceSchema, source)).toBe(true);
    expect(Value.Check(flowRunSourceSchema, "cron")).toBe(false);
  });

  test("the schema accepts exactly the listed sources", () => {
    expect(flowRunSources).toEqual([
      "manual",
      "webhook",
      "schedule",
      "miniapp",
      "event",
      "watch",
      "api",
    ]);
    for (const source of flowRunSources)
      expect(Value.Check(flowRunSourceSchema, source)).toBe(true);
  });
});

describe("run list paging", () => {
  test("reads a decimal limit within bounds, defaults without one, rejects the rest", () => {
    expect(parseRunListLimit(undefined)).toBeUndefined();
    expect(parseRunListLimit("1")).toBe(1);
    expect(parseRunListLimit("25")).toBe(25);
    expect(parseRunListLimit(String(runListMaxLimit))).toBe(runListMaxLimit);
    for (const bad of ["0", "101", "-1", "1.5", "abc", "", " 5"])
      expect(parseRunListLimit(bad)).toBeNull();
  });

  test("a page carries its runs and, only with more to come, a cursor", () => {
    const summary = {
      id: "run-1",
      flowId: "flow-1",
      flowName: "Ping",
      status: "succeeded",
      source: "manual",
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
    };
    expect(Value.Check(runListSchema, { runs: [summary] })).toBe(true);
    expect(Value.Check(runListSchema, { runs: [summary], nextCursor: "abc" })).toBe(true);
    expect(Value.Check(runListSchema, { runs: [summary], nextCursor: "" })).toBe(false);
    expect(Value.Check(listAllRunsContract.query, { flowId: "f", cursor: "c", limit: "10" })).toBe(
      true,
    );
    expect(Value.Check(listRunsContract.query, { limit: 10 })).toBe(false);
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
