import { Value } from "@sinclair/typebox/value";
import { describe, expect, test } from "bun:test";
import {
  createFlowContract,
  deleteFlowContract,
  findFlowDocumentProblem,
  flowChainId,
  flowDocumentSchema,
  flowNodeTypes,
  getFlowContract,
  isFlowDocument,
  isFlowDocumentInput,
  isFlowPatch,
  listFlowsContract,
  updateFlowContract,
  type FlowDocument,
} from "./flows";

const document: FlowDocument = {
  version: 1,
  id: "flow-1",
  name: "Ticket checkout",
  description: "Verify a visitor, collect payment and issue a ticket.",
  nodes: [
    {
      id: "n1",
      type: "trigger.miniapp-open",
      position: { x: 0, y: 0 },
      label: "Mini-app opened",
      config: {},
    },
    {
      id: "n2",
      type: "privy.wallet",
      position: { x: 300, y: 0 },
      label: "Collect payment",
      config: { note: "dummy" },
    },
  ],
  edges: [{ id: "e1", source: "n1", target: "n2" }],
};

describe("flow document schema", () => {
  test("accepts a representative document", () => {
    expect(Value.Check(flowDocumentSchema, document)).toBe(true);
  });

  test("accepts a registry chain id and leaves older documents without one valid", () => {
    expect(Value.Check(flowDocumentSchema, { ...document, chainId: 4801 })).toBe(true);
    expect(Value.Check(flowDocumentSchema, { ...document, chainId: 8453 })).toBe(false);
    expect(flowChainId(document)).toBe(84532);
    expect(flowChainId({ ...document, chainId: 4801 })).toBe(4801);
  });

  test("accepts edges with handle ids", () => {
    const withHandles = {
      ...document,
      edges: [{ id: "e1", source: "n1", target: "n2", sourceHandle: "out", targetHandle: "in" }],
    };
    expect(Value.Check(flowDocumentSchema, withHandles)).toBe(true);
  });

  test("lists 46 node types with no duplicates", () => {
    expect(flowNodeTypes).toHaveLength(46);
    expect(new Set(flowNodeTypes).size).toBe(flowNodeTypes.length);
  });

  test.each([
    [
      "unknown node type",
      { ...document, nodes: [{ ...document.nodes[0], type: "logic.nonexistent" }] },
    ],
    ["wrong version", { ...document, version: 2 }],
    ["missing config", { ...document, nodes: [{ ...document.nodes[0], config: undefined }] }],
    ["empty node id", { ...document, nodes: [{ ...document.nodes[0], id: "" }] }],
    ["edge without target", { ...document, edges: [{ id: "e1", source: "n1" }] }],
    [
      "non-numeric position",
      { ...document, nodes: [{ ...document.nodes[0], position: { x: "0", y: 0 } }] },
    ],
  ])("rejects %s", (_name, invalid) => {
    expect(Value.Check(flowDocumentSchema, invalid)).toBe(false);
  });
});

describe("flow document input", () => {
  const { id: _id, ...input } = document;

  test("accepts a document without an id", () => {
    expect(isFlowDocumentInput(input)).toBe(true);
    expect(isFlowDocumentInput({ ...input, chainId: 4801 })).toBe(true);
  });

  test.each([
    ["an id", { ...input, id: "flow-1" }],
    ["a blank name", { ...input, name: "   " }],
    ["an empty name", { ...input, name: "" }],
    ["an overlong name", { ...input, name: "a".repeat(121) }],
    ["unknown keys", { ...input, ownerId: "did:privy:bob" }],
    ["a chain off the registry", { ...input, chainId: 1 }],
  ])("rejects %s", (_name, invalid) => {
    expect(isFlowDocumentInput(invalid)).toBe(false);
  });

  test("findFlowDocumentProblem accepts a consistent graph", () => {
    expect(findFlowDocumentProblem(input)).toBeNull();
  });

  const group = { id: "g1", label: "Checkout", position: { x: 0, y: 0 }, width: 400, height: 200 };

  test("accepts groups and nodes that sit in them", () => {
    const grouped = {
      ...input,
      groups: [group],
      nodes: [{ ...input.nodes[0]!, parentId: "g1" }, input.nodes[1]!],
    };
    expect(isFlowDocumentInput(grouped)).toBe(true);
    expect(isFlowDocument({ ...grouped, id: "flow-1" })).toBe(true);
    expect(findFlowDocumentProblem(grouped)).toBeNull();
  });

  test.each([
    ["a duplicate group id", { ...input, groups: [group, group] }],
    [
      "a node in a group that does not exist",
      { ...input, nodes: [{ ...input.nodes[0]!, parentId: "gx" }] },
    ],
    ["a node and a group sharing an id", { ...input, groups: [{ ...group, id: "n1" }] }],
  ])("findFlowDocumentProblem reports %s", (_name, invalid) => {
    expect(findFlowDocumentProblem(invalid)).toEqual(expect.any(String));
  });

  test("rejects a group without a size", () => {
    expect(isFlowDocumentInput({ ...input, groups: [{ ...group, width: 0 }] })).toBe(false);
  });

  test.each([
    ["a duplicate node id", { ...input, nodes: [input.nodes[0]!, input.nodes[0]!] }],
    [
      "a duplicate edge id",
      { ...input, edges: [input.edges[0]!, { ...input.edges[0]!, target: "n2" }] },
    ],
    ["a self loop", { ...input, edges: [{ id: "e1", source: "n1", target: "n1" }] }],
    [
      "an edge from a missing node",
      { ...input, edges: [{ id: "e1", source: "nx", target: "n2" }] },
    ],
    ["an edge to a missing node", { ...input, edges: [{ id: "e1", source: "n1", target: "nx" }] }],
  ])("findFlowDocumentProblem reports %s", (_name, invalid) => {
    expect(findFlowDocumentProblem(invalid)).toEqual(expect.any(String));
  });
});

describe("flow endpoint contracts", () => {
  test("paths and methods", () => {
    expect([listFlowsContract, createFlowContract, getFlowContract, updateFlowContract]).toEqual([
      expect.objectContaining({ method: "GET", path: "/flows" }),
      expect.objectContaining({ method: "POST", path: "/flows" }),
      expect.objectContaining({ method: "GET", path: "/flows/:id" }),
      expect.objectContaining({ method: "PUT", path: "/flows/:id" }),
    ]);
  });

  test("a record response carries the document and timestamps", () => {
    const record = {
      flow: document,
      createdAt: "2026-09-07T00:00:00.000Z",
      updatedAt: "2026-09-07T00:00:00.000Z",
    };
    expect(Value.Check(getFlowContract.response[200], record)).toBe(true);
    expect(Value.Check(getFlowContract.response[200], { flow: document })).toBe(false);
  });
});

describe("flow patches", () => {
  test("accept activation, app publication or both, and reject anything else", () => {
    expect(isFlowPatch({ enabled: true })).toBe(true);
    expect(isFlowPatch({ appPublished: true })).toBe(true);
    expect(isFlowPatch({ enabled: false, appPublished: true })).toBe(true);
    expect(isFlowPatch({})).toBe(false);
    expect(isFlowPatch({ enabled: "yes" })).toBe(false);
    expect(isFlowPatch({ enabled: true, name: "x" })).toBe(false);
  });
});

describe("delete and public contracts", () => {
  test("paths", () => {
    expect(deleteFlowContract).toMatchObject({ method: "DELETE", path: "/flows/:id" });
    expect(Value.Check(deleteFlowContract.response[200], { id: "flow-1" })).toBe(true);
  });
});
