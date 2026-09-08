import { describe, expect, test } from "bun:test";
import type { ExplainRunRequest } from "@automator/contracts";
import { scriptedModel, type ChatResponse } from "@automator/flow-engine";
import { explainRun } from "./explain-run";
import { FlowGenerationError } from "./generate-flow";

const text = (content: unknown): ChatResponse => ({
  content: JSON.stringify(content),
  toolCalls: [],
});

const request: ExplainRunRequest = {
  document: {
    version: 1,
    name: "Alert",
    description: "",
    nodes: [
      { id: "n1", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Run", config: {} },
      {
        id: "n2",
        type: "logic.condition",
        position: { x: 300, y: 0 },
        label: "Big?",
        config: { left: "{{input.value.amount}}", operator: "greater_than", right: "10" },
      },
      {
        id: "n3",
        type: "notify.discord",
        position: { x: 600, y: 0 },
        label: "Post",
        config: {
          webhookUrl: "https://discord.com/api/webhooks/1/abc",
          content: "hi {{secrets.discord}}",
          username: "",
        },
      },
    ],
    edges: [
      { id: "e1", source: "n1", sourceHandle: "run", target: "n2", targetHandle: "value" },
      { id: "e2", source: "n2", sourceHandle: "true", target: "n3", targetHandle: "message" },
    ],
  },
  run: {
    status: "failed",
    trigger: { nodeId: "n1", payload: { amount: 12, apiKey: "k-123" } },
    nodes: [
      { nodeId: "n1", status: "succeeded", outputs: { run: { amount: 12 } } },
      { nodeId: "n2", status: "succeeded", outputs: { true: { amount: 12 } } },
      { nodeId: "n3", status: "failed", error: "Discord answered 401" },
    ],
  },
  nodeId: "n3",
};

describe("explainRun", () => {
  test("sends the redacted flow and results, and passes a message answer through", async () => {
    const { model, requests } = scriptedModel([
      text({ message: "Discord refused the webhook. Set a valid webhook URL on Post." }),
    ]);
    await expect(explainRun(model, request)).resolves.toEqual({
      kind: "message",
      text: "Discord refused the webhook. Set a valid webhook URL on Post.",
    });
    const [system, user] = requests[0]!.messages;
    expect(system!.role).toBe("system");
    expect(system!.content).toContain("Node types you may use");
    expect(system!.content).toContain("why the node failed");
    expect(user!.content).not.toContain("discord.com/api/webhooks");
    expect(user!.content).toContain("{{secrets.discord}}");
    expect(user!.content).not.toContain("k-123");
    expect(user!.content).toContain('"webhookUrl":""');
    expect(user!.content).toContain("- Post (n3): failed; error: Discord answered 401");
    expect(user!.content).toContain('- Big? (n2): succeeded; outputs: {"true":{"amount":12}}');
    expect(user!.content).toContain("started by Run (n1)");
    expect(user!.content).toContain("Explain why Post (n3) failed");
    expect(user!.content).not.toContain("position");
  });

  test("validates a proposed fix like a generated flow, keeping the summary", async () => {
    const fix = {
      summary: "The condition compared text; the fix compares the amount as a number.",
      name: "Alert",
      description: "",
      nodes: [
        { id: "n1", type: "trigger.manual", label: "Run", config: {} },
        {
          id: "n2",
          type: "logic.condition",
          label: "Big?",
          config: { left: "{{input.value.amount}}", operator: "greater_than", right: "10" },
        },
        { id: "n3", type: "notify.discord", label: "Post", config: { content: "hi" } },
      ],
      edges: [
        { source: "n1", sourceHandle: "run", target: "n2", targetHandle: "value" },
        { source: "n2", sourceHandle: "true", target: "n3", targetHandle: "message" },
      ],
    };
    const { model } = scriptedModel([text(fix)]);
    const answer = await explainRun(model, request);
    if (answer.kind !== "flow") throw new Error("expected a flow");
    expect(answer.summary).toBe(fix.summary);
    expect(answer.document.nodes.map((node) => node.id)).toEqual(["n1", "n2", "n3"]);

    const broken = text({ ...fix, edges: [] });
    const hopeless = scriptedModel([broken, broken]);
    await expect(explainRun(hopeless.model, request)).rejects.toBeInstanceOf(FlowGenerationError);
  });

  test("falls back to the first failed node, then the run-wide error", async () => {
    const { model, requests } = scriptedModel([text({ message: "a" }), text({ message: "b" })]);
    await explainRun(model, { ...request, nodeId: undefined });
    expect(requests[0]!.messages[1]!.content).toContain("Explain why Post (n3) failed");
    await explainRun(model, {
      ...request,
      nodeId: undefined,
      run: { status: "failed", trigger: { nodeId: null }, nodes: [], error: "No trigger" },
    });
    const content = requests[1]!.messages[1]!.content;
    expect(content).toContain("with the error: No trigger");
    expect(content).toContain("(no node ran)");
    expect(content).toContain("Explain why the run failed as a whole");
  });
});
