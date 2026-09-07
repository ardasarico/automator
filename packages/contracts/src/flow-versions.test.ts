import { Value } from "@sinclair/typebox/value";
import { describe, expect, test } from "bun:test";
import { buildPath, parseResponse } from "./contract";
import {
  flowVersionRecordSchema,
  flowVersionSummarySchema,
  getFlowVersionContract,
  listFlowVersionsContract,
  type FlowVersionRecord,
  type FlowVersionSummary,
} from "./flow-versions";

const summary: FlowVersionSummary = {
  id: "ver-1",
  number: 3,
  name: "Ticket checkout",
  createdAt: "2026-09-07T10:00:00.000Z",
  nodeCount: 2,
};

const record: FlowVersionRecord = {
  id: "ver-1",
  number: 3,
  name: "Ticket checkout",
  description: "Verify, pay, issue.",
  document: {
    version: 1,
    id: "flow-1",
    name: "Ticket checkout",
    description: "Verify, pay, issue.",
    nodes: [
      { id: "n1", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Run", config: {} },
    ],
    edges: [],
  },
  createdAt: "2026-09-07T10:00:00.000Z",
};

describe("flow version schemas", () => {
  test("accept a summary and a record", () => {
    expect(Value.Check(flowVersionSummarySchema, summary)).toBe(true);
    expect(Value.Check(flowVersionRecordSchema, record)).toBe(true);
  });

  test("numbers start at one and node counts are never negative", () => {
    expect(Value.Check(flowVersionSummarySchema, { ...summary, number: 0 })).toBe(false);
    expect(Value.Check(flowVersionSummarySchema, { ...summary, nodeCount: -1 })).toBe(false);
    expect(Value.Check(flowVersionRecordSchema, { ...record, number: 1.5 })).toBe(false);
  });

  test("a record needs a valid document", () => {
    expect(Value.Check(flowVersionRecordSchema, { ...record, document: { version: 1 } })).toBe(
      false,
    );
  });
});

describe("flow version contracts", () => {
  test("build their paths from the flow id and the number", () => {
    expect(buildPath(listFlowVersionsContract, { id: "flow 1" })).toBe("/flows/flow%201/versions");
    expect(buildPath(getFlowVersionContract, { id: "flow-1", number: "3" })).toBe(
      "/flows/flow-1/versions/3",
    );
  });

  test("parse a 200 list, a 200 record and a 404", () => {
    expect(parseResponse(listFlowVersionsContract, 200, { versions: [summary] })).toEqual({
      status: 200,
      data: { versions: [summary] },
    });
    expect(parseResponse(getFlowVersionContract, 200, record)).toEqual({
      status: 200,
      data: record,
    });
    expect(parseResponse(getFlowVersionContract, 404, { error: "not_found" })).toEqual({
      status: 404,
      data: { error: "not_found" },
    });
    expect(() => parseResponse(listFlowVersionsContract, 200, { versions: [{}] })).toThrow();
  });
});
