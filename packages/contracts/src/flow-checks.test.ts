import { describe, expect, test } from "bun:test";
import { countErrors, findActivationBlockers, findFlowProblems } from "./flow-checks";
import {
  flowActivationRefusalSchema,
  refusedActivationProblems,
  type FlowProblem,
} from "./flow-problems";
import { patchFlowContract, type FlowNode } from "./flows";
import { parseResponse } from "./contract";
import { Value } from "@sinclair/typebox/value";

function node(id: string, type: FlowNode["type"], config: Record<string, unknown> = {}): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, label: id, config };
}

const payout = (config: Record<string, unknown>) => ({
  nodes: [node("start", "trigger.manual"), node("pay", "usdc.payout", config)],
  edges: [{ id: "e", source: "start", target: "pay" }],
});

describe("findFlowProblems", () => {
  test("names a node by its own label first", () => {
    const nodes = [
      node("start", "trigger.manual"),
      { ...node("pay", "usdc.payout", { to: "", amount: "1" }), label: "Send the bounty" },
    ];
    expect(
      findFlowProblems({ nodes, edges: [{ id: "e", source: "start", target: "pay" }] }),
    ).toEqual([
      { severity: "error", nodeId: "pay", message: "“Send the bounty” needs a recipient address." },
    ]);
  });

  test("falls back to the caller's naming, then to the node type", () => {
    const document = { ...payout({ to: "", amount: "1" }) };
    document.nodes[1] = { ...document.nodes[1]!, label: "" };
    expect(findFlowProblems(document)[0]!.message).toBe("“usdc.payout” needs a recipient address.");
    expect(
      findFlowProblems(document, { fallbackLabel: (type) => `the ${type} node` })[0]!.message,
    ).toBe("“the usdc.payout node” needs a recipient address.");
  });
});

describe("findActivationBlockers", () => {
  test("keeps errors and drops warnings, because a fork blanks every secret", () => {
    const document = {
      nodes: [
        node("start", "trigger.manual"),
        node("post", "notify.discord", { webhookUrl: "", content: "hi" }),
        node("pay", "usdc.payout", { to: "", amount: "1" }),
      ],
      edges: [
        { id: "e1", source: "start", target: "post" },
        { id: "e2", source: "post", target: "pay" },
      ],
    };
    const all = findFlowProblems(document);
    expect(all.map((problem) => problem.severity)).toEqual(["warning", "error"]);
    expect(findActivationBlockers(document)).toEqual([
      { severity: "error", nodeId: "pay", message: "“pay” needs a recipient address." },
    ]);
    expect(countErrors(all)).toBe(1);
  });

  test("a flow with only warnings has nothing blocking it", () => {
    expect(
      findActivationBlockers({
        nodes: [
          node("start", "trigger.manual"),
          node("post", "notify.discord", { webhookUrl: "", content: "hi" }),
        ],
        edges: [{ id: "e", source: "start", target: "post" }],
      }),
    ).toEqual([]);
  });

  test("a healthy flow blocks nothing", () => {
    expect(findActivationBlockers(payout({ to: "0x" + "1".repeat(40), amount: "12.50" }))).toEqual(
      [],
    );
  });

  test("an unfireable schedule blocks activation", () => {
    const blockers = findActivationBlockers({
      nodes: [node("tick", "trigger.schedule", { every: "every Monday" })],
      edges: [],
    });
    expect(blockers).toHaveLength(1);
    expect(blockers[0]!.message).toContain("never fires");
  });

  test("a structural fault blocks activation on its own", () => {
    expect(
      findActivationBlockers({
        nodes: [node("a", "trigger.manual"), node("a", "screen.page")],
        edges: [],
      }),
    ).toEqual([{ severity: "error", message: 'Duplicate node id "a"' }]);
    expect(findActivationBlockers({ nodes: [], edges: [] })).toEqual([
      { severity: "error", message: "The flow is empty. Add a trigger to start from." },
    ]);
  });
});

describe("the activation refusal body", () => {
  test("carries problems, and still matches a plain refusal that has none", () => {
    const withProblems = {
      error: "invalid_flow",
      problems: [{ severity: "error", nodeId: "pay", message: "“pay” needs a recipient address." }],
    };
    expect(Value.Check(flowActivationRefusalSchema, withProblems)).toBe(true);
    expect(Value.Check(flowActivationRefusalSchema, { error: "invalid_flow" })).toBe(true);
    expect(Value.Check(flowActivationRefusalSchema, { error: "not_a_code" })).toBe(false);
  });

  test("reading problems out of a body tolerates anything the client is handed", () => {
    expect(refusedActivationProblems({ error: "invalid_flow", problems: [] })).toEqual([]);
    expect(refusedActivationProblems({ error: "invalid_flow" })).toEqual([]);
    expect(refusedActivationProblems({ nonsense: true })).toEqual([]);
    expect(refusedActivationProblems(null)).toEqual([]);
    expect(
      refusedActivationProblems({
        error: "invalid_flow",
        problems: [{ severity: "error", message: "broken" }],
      }),
    ).toEqual([{ severity: "error", message: "broken" }]);
  });
});

describe("the patch contract carries a refusal", () => {
  test("422 accepts both a plain refusal and one naming problems", () => {
    const schema = patchFlowContract.response[422];
    expect(Value.Check(schema, { error: "invalid_flow" })).toBe(true);
    expect(
      Value.Check(schema, {
        error: "invalid_flow",
        problems: [
          { severity: "error", nodeId: "pay", message: "“pay” needs a recipient address." },
        ],
      }),
    ).toBe(true);
    expect(
      Value.Check(schema, { error: "invalid_flow", problems: [{ message: "no severity" }] }),
    ).toBe(false);
  });

  test("a client reading the response gets the problems, not a stripped body", () => {
    const body = {
      error: "invalid_flow",
      problems: [
        { severity: "error", message: "The flow is empty. Add a trigger to start from." },
      ] satisfies FlowProblem[],
    };
    const result = parseResponse(patchFlowContract, 422, body);
    expect(result.status).toBe(422);
    expect(refusedActivationProblems(result.data)).toEqual(body.problems);
  });
});
