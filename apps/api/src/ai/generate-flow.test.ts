import { describe, expect, test } from "bun:test";
import { findFlowDocumentProblem, type FlowDocumentInput } from "@automator/contracts";
import { defaultExecutors, scriptedModel, type ChatResponse } from "@automator/flow-engine";
import {
  FlowGenerationError,
  generatableNodeTypes,
  generateFlow,
  materialize,
} from "./generate-flow";

const text = (content: unknown): ChatResponse => ({
  content: JSON.stringify(content),
  toolCalls: [],
});

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
  test("only offers node types with an executor", () => {
    expect(generatableNodeTypes).toContain("notify.discord");
    expect(generatableNodeTypes).toContain("screen.form");
    for (const type of generatableNodeTypes) expect(defaultExecutors[type]).toBeDefined();
  });

  test("turns a valid answer into a laid-out, cleaned document", async () => {
    const { model, requests } = scriptedModel([text(good)]);
    const { document, summary } = await generateFlow(model, "alert me on big amounts");
    expect(summary).toBe("A webhook triggers a Discord post.");
    expect(findFlowDocumentProblem(document)).toBeNull();
    expect(document.nodes.map((node) => [node.id, node.position])).toEqual([
      ["n1", { x: 80, y: 120 }],
      ["n2", { x: 380, y: 120 }],
      ["n3", { x: 680, y: 120 }],
      ["n4", { x: 680, y: 260 }],
    ]);
    // Unknown config keys are dropped and defaults filled, so the canvas gets a complete config.
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
    const { document } = await generateFlow(model, "add a wait", current);
    expect(document.nodes.map((node) => node.id)).toEqual(["keep", "n2"]);
    expect(requests[0]!.messages[1]!.content).toContain('"id":"keep"');
    expect(requests[0]!.messages[1]!.content).not.toContain("position");
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
