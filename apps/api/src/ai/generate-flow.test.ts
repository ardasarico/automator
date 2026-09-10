import { describe, expect, test } from "bun:test";
import { findFlowDocumentProblem, type FlowDocumentInput } from "@automator/contracts";
import {
  defaultExecutors,
  runFlow,
  scriptedModel,
  type ChatResponse,
} from "@automator/flow-engine";
import {
  FlowGenerationError,
  generatableNodeTypes,
  generateFlow,
  historyMessages,
  materialize,
} from "./generate-flow";

const text = (content: unknown): ChatResponse => ({
  content: JSON.stringify(content),
  toolCalls: [],
});

async function flowOf(answer: ReturnType<typeof generateFlow>) {
  const result = await answer;
  if (result.kind !== "flow") throw new Error(`expected a flow, got ${result.kind}`);
  return result;
}

const good = {
  name: "Price alert",
  description: "Posts to Discord when a webhook fires.",
  summary: "A webhook triggers a Discord post.",
  nodes: [
    { id: "n1", type: "trigger.webhook", label: "Webhook", config: {} },
    {
      id: "n2",
      type: "logic.condition",
      label: "Big?",
      config: { left: "{{input.value.amount}}", operator: "greater_than", right: "10" },
    },
    {
      id: "n3",
      type: "notify.discord",
      label: "Post",
      config: { content: "Big: {{input.message.amount}}", bogus: 1 },
    },
    { id: "n4", type: "screen.page", label: "Thanks", config: { title: "Thanks" } },
  ],
  edges: [
    { source: "n1", sourceHandle: "request", target: "n2", targetHandle: "value" },
    { source: "n2", sourceHandle: "true", target: "n3", targetHandle: "message" },
    { source: "n2", sourceHandle: "false", target: "n4", targetHandle: "data" },
  ],
};

describe("generateFlow", () => {
  test("generates an executable For each body followed by a Done screen", async () => {
    const draft = {
      name: "Loop",
      description: "QA",
      summary: "Loop then show a page.",
      nodes: [
        { id: "t", type: "trigger.manual", label: "Start", config: {} },
        { id: "loop", type: "logic.for-each", label: "Each", config: { items: "[1,2]" } },
        {
          id: "body",
          type: "logic.set-variable",
          label: "Keep",
          config: { name: "last", value: "{{input.value}}" },
        },
        { id: "done", type: "screen.page", label: "Done", config: {} },
      ],
      edges: [
        { source: "t", sourceHandle: "run", target: "loop", targetHandle: "items" },
        { source: "loop", sourceHandle: "item", target: "body", targetHandle: "value" },
        { source: "loop", sourceHandle: "done", target: "done", targetHandle: "data" },
      ],
    };
    const { model, requests } = scriptedModel([text(draft)]);
    const { document } = await flowOf(generateFlow(model, "Loop over [1,2] then show a page"));
    expect(requests[0]!.messages[0]!.content).toContain("logic.for-each");
    const result = await runFlow({ ...document, id: "generated" });
    expect(result.status).toBe("waiting");
    expect(result.variables).toEqual({ last: 2 });
  });

  test("offers executor types and the engine's built-in loop", () => {
    expect(generatableNodeTypes).toContain("notify.discord");
    expect(generatableNodeTypes).toContain("screen.form");
    expect(generatableNodeTypes).toContain("logic.for-each");
    for (const type of generatableNodeTypes)
      if (type !== "logic.for-each") expect(defaultExecutors[type]).toBeDefined();
  });

  test("turns a valid answer into a laid-out, cleaned document", async () => {
    const { model, requests } = scriptedModel([text(good)]);
    const { document, summary } = await flowOf(generateFlow(model, "alert me on big amounts"));
    expect(summary).toBe("A webhook triggers a Discord post.");
    expect(findFlowDocumentProblem(document)).toBeNull();
    expect(document.nodes.map((node) => [node.id, node.position])).toEqual([
      ["n1", { x: 80, y: 120 }],
      ["n2", { x: 380, y: 120 }],
      ["n3", { x: 680, y: 120 }],
      ["n4", { x: 680, y: 260 }],
    ]);
    expect(document.nodes[2]!.config).toEqual({
      webhookUrl: "",
      content: "Big: {{input.message.amount}}",
      username: "",
    });
    expect(document.edges.map((edge) => edge.id)).toEqual(["e1", "e2", "e3"]);
    expect(requests[0]!.responseFormat).toEqual({ type: "json_object" });
    expect(requests[0]!.messages[0]!.content).toContain(
      "- notify.discord: inputs [message], outputs [sent]",
    );
    expect(requests[0]!.messages[1]!.content).toContain("alert me on big amounts");
  });

  test("sends the current document for an edit and keeps the model's ids", async () => {
    const current: FlowDocumentInput = {
      version: 1,
      name: "Old",
      description: "",
      nodes: [
        { id: "keep", type: "trigger.manual", position: { x: 5, y: 5 }, label: "Run", config: {} },
      ],
      edges: [],
    };
    const { model, requests } = scriptedModel([
      text({
        ...good,
        nodes: [
          { id: "keep", type: "trigger.manual", label: "Run", config: {} },
          { id: "n2", type: "logic.wait", label: "Wait", config: { seconds: 2 } },
        ],
        edges: [{ source: "keep", sourceHandle: "run", target: "n2", targetHandle: "in" }],
      }),
    ]);
    const { document } = await flowOf(generateFlow(model, "add a wait", current));
    expect(document.nodes.map((node) => node.id)).toEqual(["keep", "n2"]);
    expect(requests[0]!.messages[1]!.content).toContain('"id":"keep"');
    expect(requests[0]!.messages[1]!.content).not.toContain("position");
  });

  test("sends the recent history before the request, summaries only", async () => {
    const { model, requests } = scriptedModel([text(good)]);
    const history = Array.from({ length: 15 }, (_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      text: `turn ${index}`,
    }));
    history.push({ role: "assistant", text: "" });
    await generateFlow(model, "also notify Discord", undefined, history);
    const messages = requests[0]!.messages;
    expect(messages[0]!.role).toBe("system");
    expect(messages[0]!.content).toContain("Earlier turns of the conversation");
    expect(messages.slice(1, -1).map((message) => message.content)).toEqual(
      history.slice(-12, -1).map((turn) => turn.text),
    );
    expect(messages.slice(1, -1).map((message) => message.role)).toEqual(
      history.slice(-12, -1).map((turn) => turn.role),
    );
    expect(messages.at(-1)!.content).toContain("also notify Discord");
    expect(historyMessages([{ role: "user", text: "x".repeat(2000) }])[0]!.content).toHaveLength(
      1500,
    );
  });

  test("passes a message answer through instead of a flow", async () => {
    const { model } = scriptedModel([text({ message: "Which chain should the payout use?" })]);
    await expect(generateFlow(model, "pay someone")).resolves.toEqual({
      kind: "message",
      text: "Which chain should the payout use?",
    });
    const empty = scriptedModel([text({ message: "  " }), text(good)]);
    await expect(flowOf(generateFlow(empty.model, "x"))).resolves.toMatchObject({
      summary: good.summary,
    });
    expect(empty.requests[1]!.messages.at(-1)!.content).toContain("needs nodes and edges");
  });

  test("retries once with the problem, then gives up", async () => {
    const bad = {
      ...good,
      edges: [{ source: "n1", sourceHandle: "nope", target: "n2", targetHandle: "value" }],
    };
    const recovered = scriptedModel([text(bad), text(good)]);
    await expect(generateFlow(recovered.model, "x")).resolves.toMatchObject({
      summary: good.summary,
    });
    expect(recovered.requests[1]!.messages.at(-1)!.content).toContain(
      '"trigger.webhook" has no output handle "nope"',
    );

    const hopeless = scriptedModel([text(bad), { content: "not json", toolCalls: [] }]);
    await expect(generateFlow(hopeless.model, "x")).rejects.toBeInstanceOf(FlowGenerationError);
  });

  test("keeps the original expectations when repairing an invalid graph", async () => {
    const proposal = {
      name: "Tickets",
      nodes: [
        { id: "start", type: "trigger.manual", config: {} },
        { id: "calculate", type: "logic.run-code", config: { code: "return {total: 49};" } },
      ],
      edges: [{ source: "start", sourceHandle: "run", target: "calculate", targetHandle: "input" }],
    };
    const tests = (equals: number) => [
      {
        name: "Two tickets cost 50",
        expect: [{ nodeId: "calculate", output: "output", path: "total", equals }],
      },
    ];
    const broken = {
      ...proposal,
      edges: [{ ...proposal.edges[0], sourceHandle: "missing" }],
      tests: tests(50),
    };
    const { model } = scriptedModel([text(broken), text({ ...proposal, tests: tests(49) })]);
    /*
     * The repair still does not pass, but there is a flow: it is handed over with the failure
     * attached rather than thrown away, so the user can see the wiring fault on the canvas.
     */
    const answer = await generateFlow(model, "Two tickets cost 50");
    expect(answer.kind).toBe("flow");
    if (answer.kind !== "flow") throw new Error("expected a flow");
    expect(answer.verification?.checks).toEqual([
      { name: "Automatic checks", status: "failed", detail: expect.stringContaining("got 49") },
    ]);
    expect(answer.verification?.warnings.join(" ")).toContain("did not pass its automatic checks");
  });

  test("an answer with no usable flow in it at all is still fatal", async () => {
    /* Nothing to hand over: the graph never materialises, so there is no draft to salvage. */
    const orphan = { ...good, edges: [] };
    const { model } = scriptedModel([text(orphan), text(orphan)]);
    await expect(generateFlow(model, "Two tickets cost 50")).rejects.toThrow(
      "has no incoming edge",
    );
    const gibberish = { content: "not json at all", toolCalls: [] };
    await expect(
      generateFlow(scriptedModel([gibberish, gibberish]).model, "anything"),
    ).rejects.toThrow(FlowGenerationError);
  });
});

describe("materialize", () => {
  type Draft = Parameters<typeof materialize>[0];
  const draft = (patch: Partial<Draft>): Draft => ({ ...(good as Draft), ...patch });
  const cyclic: Draft = {
    ...(good as Draft),
    nodes: [
      { id: "n1", type: "trigger.manual", label: "Run", config: {} },
      { id: "n2", type: "ai.agent", label: "Agent", config: {} },
      { id: "n3", type: "logic.wait", label: "Wait", config: {} },
    ],
    edges: [
      { source: "n1", sourceHandle: "run", target: "n2", targetHandle: "prompt" },
      { source: "n2", sourceHandle: "result", target: "n3", targetHandle: "in" },
      { source: "n3", sourceHandle: "done", target: "n2", targetHandle: "context" },
    ],
  };
  const withConfig = (id: string, config: Record<string, unknown>) =>
    (good as Draft).nodes.map((node) => (node.id === id ? { ...node, config } : node));

  test.each([
    [
      "no trigger",
      draft({ nodes: (good as Draft).nodes.slice(1), edges: (good as Draft).edges.slice(1) }),
      "needs a trigger",
    ],
    [
      "an orphan",
      draft({ edges: (good as Draft).edges.slice(0, 2) }),
      'Node "n4" has no incoming edge',
    ],
    [
      "two edges into one input",
      draft({
        edges: [
          ...(good as Draft).edges,
          { source: "n1", sourceHandle: "request", target: "n3", targetHandle: "message" },
        ],
      }),
      "has two edges",
    ],
    ["a cycle", cyclic, "cycle"],
    ["a bad config", draft({ nodes: withConfig("n2", { operator: "maybe" }) }), "does not fit"],
  ])("rejects %s", (_name, source, message) => {
    expect(() => materialize(source)).toThrow(message);
  });
});

describe("readDraft through generateFlow", () => {
  test("refuses node types without an executor", async () => {
    const bad = text({
      ...good,
      nodes: [{ id: "n1", type: "nope.unknown", label: "", config: {} }],
      edges: [],
    });
    const { model } = scriptedModel([bad, bad]);
    await expect(generateFlow(model, "x")).rejects.toThrow(
      'Node type "nope.unknown" is not available',
    );
  });
});
