import { describe, expect, test } from "bun:test";
import type { AiFlowTest, FlowDocumentInput, FlowNode } from "@automator/contracts";
import { scriptedModel } from "@automator/flow-engine";
import { generateFlow, materialize, systemPrompt, withoutPositions } from "./generate-flow";
import { verifyFlow } from "./verify-flow";

const node = (id: string, type: FlowNode["type"], config = {}): FlowNode => ({
  id,
  type,
  label: id,
  position: { x: 0, y: 0 },
  config,
});
const calculator: FlowDocumentInput = {
  version: 1,
  name: "Tickets",
  description: "",
  nodes: [
    node("open", "trigger.miniapp-open"),
    node("form", "screen.form", {
      fields: [{ id: "ticketCount", type: "number", required: true, sample: "2" }],
    }),
    node("calculate", "logic.run-code", {
      code: "return {total: Number(input.ticketCount) * 25};",
    }),
    node("result", "screen.page", { body: "Total: {{input.data.total}}" }),
  ],
  edges: [
    { id: "a", source: "open", sourceHandle: "visitor", target: "form", targetHandle: "data" },
    {
      id: "b",
      source: "form",
      sourceHandle: "submitted",
      target: "calculate",
      targetHandle: "input",
    },
    {
      id: "c",
      source: "calculate",
      sourceHandle: "output",
      target: "result",
      targetHandle: "data",
    },
  ],
};
const costTest: AiFlowTest = {
  name: "2 cost 50",
  answers: { form: { port: "submitted", data: { ticketCount: "2" } } },
  expect: [
    { nodeId: "calculate", output: "output", path: "total", equals: 50 },
    { nodeId: "result", screenBody: "Total: 50" },
  ],
};
const draft = (doc: FlowDocumentInput, tests = [costTest]) => ({
  ...withoutPositions(doc),
  edges: doc.edges.map((edge) => ({
    ...edge,
    sourceHandle: edge.sourceHandle!,
    targetHandle: edge.targetHandle!,
  })),
  summary: "Built tickets",
  tests,
});
const response = (content: unknown) => ({ content: JSON.stringify(content), toolCalls: [] });

describe("automatic flow verification", () => {
  test("checks real sandbox math and the resolved result screen", async () => {
    const report = await verifyFlow(calculator, [costTest]);
    expect(report.checks[0]?.status).toBe("passed");
    expect(report.warnings.join(" ")).toContain("browser preview");
  });

  test("repairs behavior, keeping the original expectations even if the model weakens them", async () => {
    const broken = structuredClone(calculator);
    broken.nodes[2]!.config.code = "return {total: 49};";
    const { model, requests } = scriptedModel([
      response(draft(broken)),
      response(draft(calculator)),
    ]);
    const answer = await generateFlow(model, "Two tickets cost 50");
    expect(answer.kind).toBe("flow");
    expect(requests).toHaveLength(2);
    expect(requests[1]!.messages.at(-1)?.content).toContain("expected 50, got 49");
    const weakened = [
      {
        ...costTest,
        expect: [{ nodeId: "calculate", output: "output", path: "total", equals: 49 }],
      },
    ];
    const retry = scriptedModel([response(draft(broken)), response(draft(broken, weakened))]);
    await expect(generateFlow(retry.model, "Two tickets cost 50")).rejects.toThrow(
      "expected 50, got 49",
    );
  });

  test("rejects null output against a numeric expectation, missing data and non-finite math", async () => {
    const broken = structuredClone(calculator);
    broken.nodes[2]!.config.code = "return {total: null};";
    await expect(verifyFlow(broken, [costTest])).rejects.toThrow("expected 50, got null");
    broken.nodes[2]!.config.code = "return {total: input.missing * 25};";
    await expect(verifyFlow(broken, [costTest])).rejects.toThrow("non-finite");
    await expect(
      verifyFlow(calculator, [{ ...costTest, answers: { form: { port: "submitted", data: {} } } }]),
    ).rejects.toThrow("required form field");
  });

  test("runs both condition branches and the exact boundary from visitor form answers", async () => {
    const conditional = structuredClone(calculator);
    conditional.nodes[2] = node("calculate", "logic.condition", {
      left: "{{input.value.ticketCount}}",
      operator: "less_than",
      right: "5",
    });
    conditional.nodes[3] = node("result", "screen.page", {
      body: "Available: {{input.data.ticketCount}}",
    });
    conditional.nodes.push(
      node("no", "screen.page", { body: "Too many: {{input.data.ticketCount}}" }),
    );
    conditional.edges[1]!.targetHandle = "value";
    conditional.edges[2]!.sourceHandle = "true";
    conditional.edges.push({
      id: "d",
      source: "calculate",
      sourceHandle: "false",
      target: "no",
      targetHandle: "data",
    });
    const scenarios = [4, 5].map((count): AiFlowTest => ({
      name: `${count} tickets`,
      answers: { form: { port: "submitted", data: { ticketCount: String(count) } } },
      expect: [
        {
          nodeId: count === 4 ? "result" : "no",
          screenBody: `${count === 4 ? "Available" : "Too many"}: ${count}`,
        },
      ],
    }));
    const report = await verifyFlow(conditional, scenarios);
    expect(report.checks.map((check) => check.status)).toEqual(["passed", "passed"]);
    expect(report.warnings).toEqual([]);
    conditional.nodes[2]!.config.right = "4";
    await expect(verifyFlow(conditional, scenarios)).rejects.toThrow(
      "expected result to be reached",
    );
  });

  test("does not execute external actions, identity checks, or nested loops", async () => {
    const external = structuredClone(calculator);
    external.nodes[2] = node("calculate", "notify.discord", {
      webhookUrl: "https://example.invalid/must-not-call",
      content: "hello",
    });
    external.edges[1]!.targetHandle = "message";
    external.edges[2]!.sourceHandle = "sent";
    const report = await verifyFlow(external);
    expect(report.checks[0]?.status).toBe("skipped");
    expect(report.checks[0]?.detail).toContain("external service");
    external.nodes[2] = node("calculate", "world.id-verify");
    expect((await verifyFlow(external)).checks[0]?.status).toBe("skipped");
    external.nodes[2] = node("calculate", "logic.for-each", { items: "[1,2]" });
    expect((await verifyFlow(external)).checks[0]?.detail).toContain("Loop execution");
  });

  test("checks completed calculations even when a later external action is skipped", async () => {
    const external = structuredClone(calculator);
    external.nodes[3] = node("result", "notify.discord", { content: "hello" });
    external.edges[2]!.targetHandle = "message";
    const scenario = { ...costTest, expect: [costTest.expect[0]!, { nodeId: "result" }] };
    expect((await verifyFlow(external, [scenario])).checks[0]?.status).toBe("skipped");
    external.nodes[2]!.config.code = "return {total: 49};";
    await expect(verifyFlow(external, [scenario])).rejects.toThrow("expected 50, got 49");
  });

  test("does not let sandbox errors impersonate a skipped external action", async () => {
    const broken = structuredClone(calculator);
    broken.nodes[2]!.config.code = 'throw new Error("Not tested: skip my broken code");';
    await expect(verifyFlow(broken, [costTest])).rejects.toThrow("skip my broken code");
  });

  test("rejects unknown, unused or vacuous test expectations", async () => {
    await expect(verifyFlow(calculator, [{ name: "vacuous", expect: [] }])).rejects.toThrow(
      "expectation",
    );
    await expect(
      verifyFlow(calculator, [{ name: "wrong", expect: [{ nodeId: "missing" }] }]),
    ).rejects.toThrow("unknown node");
    await expect(
      verifyFlow(calculator, [
        { ...costTest, answers: { ...costTest.answers, absent: { port: "next" } } },
      ]),
    ).rejects.toThrow("never used");
    await expect(
      verifyFlow(calculator, [
        { ...costTest, expect: [{ nodeId: "calculate", path: "total", equals: 99 }] },
      ]),
    ).rejects.toThrow("require an output");
  });
});

describe("generation contracts", () => {
  test("describes nested form ids, samples and receiving-port examples", () => {
    const prompt = systemPrompt();
    expect(prompt).toContain('"items":{"type":"object"');
    expect(prompt).toContain('"sample"');
    expect(prompt).toContain("{{input.data.ticketCount}}");
    expect(prompt).toContain("server sandbox");
  });
  test("rejects incomplete forms and invalid bindings before running", () => {
    const invalid = structuredClone(calculator);
    invalid.nodes[1]!.config.fields = [{ name: "ticketCount", type: "number" }];
    expect(() => materialize(draft(invalid))).toThrow("nonempty identifier");
    invalid.nodes[1]!.config.fields = [{ id: "ticketCount" }, { id: "ticketCount" }];
    expect(() => materialize(draft(invalid))).toThrow("Duplicate form field");
    invalid.nodes[1]!.config = calculator.nodes[1]!.config;
    invalid.nodes[3]!.config.body = "Total {{input.total}}";
    expect(() => materialize(draft(invalid))).toThrow("input handle");
  });
});
