import { describe, expect, test } from "bun:test";
import type { AiFlowTest, FlowDocumentInput, FlowNode } from "@automator/contracts";
import { scriptedModel } from "@automator/flow-engine";
import { generateFlow, materialize, systemPrompt, withoutPositions } from "./generate-flow";
import { FlowTestError, VerificationTimeoutError, verifyFlow } from "./verify-flow";

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
    /*
     * The weakened expectation is still measured against the original, so the repair fails. The
     * flow is handed over anyway, with the failure named — never as a pass.
     */
    const retried = await generateFlow(retry.model, "Two tickets cost 50");
    expect(retried.kind).toBe("flow");
    if (retried.kind !== "flow") throw new Error("expected a flow");
    expect(retried.verification?.checks[0]?.status).toBe("failed");
    expect(retried.verification?.checks[0]?.detail).toContain("expected 50, got 49");
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

  test("stands in for external actions instead of skipping the rest of the flow", async () => {
    const external = structuredClone(calculator);
    external.nodes[2] = node("calculate", "notify.discord", {
      webhookUrl: "https://example.invalid/must-not-call",
      content: "hello",
    });
    external.edges[1]!.targetHandle = "message";
    external.edges[2]!.sourceHandle = "sent";
    /* The page now receives a delivery receipt, so it reads a field the receipt really has. */
    external.nodes[3]!.config.body = "Sent: {{input.data.messageId}}";
    const report = await verifyFlow(external);
    /* The node ran on its fixture, so the page after it was reached rather than abandoned. */
    expect(report.checks[0]?.status).toBe("passed");
    expect(report.warnings.join(" ")).toContain("Stood in for notify.discord");
    expect(report.warnings.join(" ")).toContain("the real delivery, payment or onchain effect");
    expect(report.warnings.join(" ")).not.toContain("Not exercised");

    external.nodes[2] = node("calculate", "world.id-verify");
    external.edges[2]!.sourceHandle = "verified";
    external.nodes[3]!.config.body = "Verified: {{input.data.nullifierHash}}";
    expect((await verifyFlow(external)).checks[0]?.status).toBe("passed");

    external.nodes[2] = node("calculate", "logic.for-each", { items: "[1,2]" });
    external.edges[2]!.sourceHandle = "done";
    expect((await verifyFlow(external)).checks[0]?.detail).toContain("Loop execution");
  });

  test("a secret placeholder is correct authoring, not a missing value", async () => {
    /*
     * Regression guard: once notify.* ran on a fixture, its config templates were checked for the
     * first time — and {{secrets.apiKey}}, which the API resolves at run time and the builder
     * blanks before the model sees it, was being reported as a broken binding.
     */
    const external = structuredClone(calculator);
    external.nodes[2] = node("calculate", "notify.email", {
      apiKey: "{{secrets.resend_key}}",
      from: "flow@example.com",
      to: "visitor@example.com",
      subject: "Total",
      text: "Your total",
    });
    external.edges[1]!.targetHandle = "message";
    external.edges[2]!.sourceHandle = "sent";
    external.nodes[3]!.config.body = "Sent: {{input.data.id}}";
    const report = await verifyFlow(external);
    expect(report.checks[0]?.status).toBe("passed");
    expect(report.warnings.join(" ")).toContain("Stood in for notify.email");
  });

  test("a data node runs on its own table's columns, or fails closed without them", async () => {
    const signups = { id: "tbl-signups", columns: [{ id: "email", type: "text" }] };
    const external = structuredClone(calculator);
    external.nodes[2] = node("calculate", "data.create-record", {
      tableId: "tbl-signups",
      values: [{ column: "email", value: "{{input.values.ticketCount}}" }],
    });
    external.edges[1]!.targetHandle = "values";
    external.edges[2]!.sourceHandle = "record";
    external.nodes[3]!.config.body = "Saved: {{input.data.values.email}}";
    const report = await verifyFlow(external, undefined, undefined, [signups]);
    expect(report.checks[0]?.status).toBe("passed");
    expect(report.warnings.join(" ")).toContain("Stood in for data.create-record");

    /* Without the table there is nothing honest to answer with, so it is reported as untested. */
    const blind = await verifyFlow(external);
    expect(blind.checks[0]?.status).toBe("skipped");
    expect(blind.checks[0]?.detail).toContain("does not have");
    expect(blind.warnings.join(" ")).not.toContain("Stood in for");
  });

  test("a balance read really runs, so a condition on the wrong field is caught", async () => {
    /*
     * The bug this exists for: a condition comparing {{input.value}} — the whole balance object —
     * instead of {{input.value.formatted}}. Nothing ran before, so nothing saw it.
     */
    const onchain: FlowDocumentInput = {
      version: 1,
      name: "Balance",
      description: "",
      nodes: [
        node("start", "trigger.manual"),
        node("balance", "usdc.balance", { address: "" }),
        node("check", "logic.condition", {
          left: "{{input.value}}",
          operator: "greater_than",
          right: "10",
        }),
      ],
      edges: [
        {
          id: "a",
          source: "start",
          sourceHandle: "run",
          target: "balance",
          targetHandle: "wallet",
        },
        {
          id: "b",
          source: "balance",
          sourceHandle: "balance",
          target: "check",
          targetHandle: "value",
        },
      ],
    };
    await expect(verifyFlow(onchain)).rejects.toThrow("needs a number on the left");

    const fixed = structuredClone(onchain);
    fixed.nodes[2]!.config.left = "{{input.value.formatted}}";
    const report = await verifyFlow(fixed);
    expect(report.checks[0]?.status).toBe("passed");
    expect(report.warnings.join(" ")).toContain("Stood in for usdc.balance");
  });

  test("checks a calculation and the notification wired after it", async () => {
    const external = structuredClone(calculator);
    external.nodes[3] = node("result", "notify.discord", { content: "hello" });
    external.edges[2]!.targetHandle = "message";
    const scenario = { ...costTest, expect: [costTest.expect[0]!, { nodeId: "result" }] };
    expect((await verifyFlow(external, [scenario])).checks[0]?.status).toBe("passed");
    external.nodes[2]!.config.code = "return {total: 49};";
    await expect(verifyFlow(external, [scenario])).rejects.toThrow("expected 50, got 49");
  });

  test("does not let sandbox errors impersonate a skipped external action", async () => {
    const broken = structuredClone(calculator);
    broken.nodes[2]!.config.code = 'throw new Error("Not tested: skip my broken code");';
    await expect(verifyFlow(broken, [costTest])).rejects.toThrow("skip my broken code");
  });

  test("compares an output with equals, greaterThan, lessThan or contains", async () => {
    const scenario = (expectation: AiFlowTest["expect"][number]): AiFlowTest => ({
      ...costTest,
      expect: [expectation],
    });
    const at = { nodeId: "calculate", output: "output", path: "total" } as const;
    // No comparison at all still asserts that the run produced a value there.
    expect((await verifyFlow(calculator, [scenario(at)])).checks[0]?.status).toBe("passed");
    expect(
      (await verifyFlow(calculator, [scenario({ ...at, greaterThan: 49, lessThan: 51 })])).checks[0]
        ?.status,
    ).toBe("passed");
    expect(
      (
        await verifyFlow(calculator, [
          scenario({ nodeId: "calculate", output: "output", contains: "50" }),
        ])
      ).checks[0]?.status,
    ).toBe("passed");
    await expect(verifyFlow(calculator, [scenario({ ...at, greaterThan: 50 })])).rejects.toThrow(
      "expected a number above 50, got 50",
    );
    await expect(verifyFlow(calculator, [scenario({ ...at, lessThan: 50 })])).rejects.toThrow(
      "expected a number below 50, got 50",
    );
    await expect(verifyFlow(calculator, [scenario({ ...at, path: "missing" })])).rejects.toThrow(
      "produced no value",
    );
  });

  test("expectations order values the way the engine's conditions do", async () => {
    const stringy = structuredClone(calculator);
    stringy.nodes[2]!.config.code = 'return {total: "50"};';
    const scenario = (expectation: AiFlowTest["expect"][number]): AiFlowTest => ({
      ...costTest,
      expect: [expectation],
    });
    const at = { nodeId: "calculate", output: "output", path: "total" } as const;
    // A numeric string is a number to `compare`, so the check agrees with logic.condition.
    expect(
      (await verifyFlow(stringy, [scenario({ ...at, greaterThan: 49 })])).checks[0]?.status,
    ).toBe("passed");
    await expect(verifyFlow(stringy, [scenario({ ...at, greaterThan: 50 })])).rejects.toThrow(
      "expected a number above 50",
    );
    // Ordering a whole object has no answer: the expectation is at fault, so the flow survives.
    const object = structuredClone(calculator);
    object.nodes[2]!.config.code = "return {total: {amount: 50}};";
    const unusable = verifyFlow(object, [scenario({ ...at, greaterThan: 10 })]);
    await expect(unusable).rejects.toBeInstanceOf(FlowTestError);
    await expect(unusable).rejects.toThrow("Compare one of its fields");
  });

  test("a scenario the model wrote badly is a test problem, not a flow problem", async () => {
    const unusable = verifyFlow(calculator, [
      { ...costTest, expect: [{ nodeId: "calculate", output: "result", equals: 50 }] },
    ]);
    await expect(unusable).rejects.toBeInstanceOf(FlowTestError);
    // A flow that misbehaves stays a plain failure, so the caller still repairs it.
    const broken = structuredClone(calculator);
    broken.nodes[2]!.config.code = "return {total: 49};";
    await expect(verifyFlow(broken, [costTest])).rejects.not.toBeInstanceOf(FlowTestError);
  });

  test("an unusable scenario keeps the flow and downgrades the checks to a warning", async () => {
    const tests = [
      { ...costTest, expect: [{ nodeId: "calculate", output: "result", equals: 50 }] },
    ];
    const { model, requests } = scriptedModel([response(draft(calculator, tests))]);
    const answer = await generateFlow(model, "Two tickets cost 50");
    expect(answer.kind).toBe("flow");
    // One call: the good flow was delivered instead of spent on a repair round-trip.
    expect(requests).toHaveLength(1);
    const warnings = answer.kind === "flow" ? (answer.verification?.warnings ?? []) : [];
    expect(warnings.join(" ")).toContain("test scenarios could not be used");
    expect(warnings.join(" ")).toContain("unknown output result");
  });

  test("checks that run out of their budget still deliver the flow, with a warning", async () => {
    /*
     * The whole point of the split: a draft is never discarded over a problem in its checks
     * rather than in itself — slow checks included, not just malformed ones.
     */
    const spent = Date.now() - 1;
    await expect(verifyFlow(calculator, [costTest], spent)).rejects.toBeInstanceOf(
      VerificationTimeoutError,
    );
    /* By inheritance, so the degrade path cannot be reached for one and missed for the other. */
    await expect(verifyFlow(calculator, [costTest], spent)).rejects.toBeInstanceOf(FlowTestError);

    const { model } = scriptedModel([response(draft(calculator))]);
    const answer = await generateFlow(model, "Two tickets cost 50", undefined, undefined, [], 0);
    expect(answer.kind).toBe("flow");
    if (answer.kind !== "flow") throw new Error("expected a flow");
    expect(answer.document.nodes).toHaveLength(4);
    expect(answer.verification?.warnings.join(" ")).toContain("did not finish in time");
    expect(answer.verification?.checks).toEqual([]);
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
