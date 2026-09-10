import { describe, expect, test } from "bun:test";
import { findFlowDocumentProblem } from "@automator/contracts";
import { defaultExecutors } from "@automator/flow-engine";
import { generatableNodeTypes, materialize } from "./draft";

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

describe("generatableNodeTypes", () => {
  test("offers executor types and the engine's built-in loop", () => {
    expect(generatableNodeTypes).toContain("notify.discord");
    expect(generatableNodeTypes).toContain("screen.form");
    expect(generatableNodeTypes).toContain("logic.for-each");
    for (const type of generatableNodeTypes)
      if (type !== "logic.for-each") expect(defaultExecutors[type]).toBeDefined();
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

  test("lays out positions, cleans config and assigns edge ids", () => {
    const document = materialize(good as Draft);
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
  });

  test("carries an explicit chainId into the document, and omits it otherwise", () => {
    expect(materialize(good as Draft).chainId).toBeUndefined();
    expect(materialize({ ...(good as Draft), chainId: 4801 }).chainId).toBe(4801);
  });

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
