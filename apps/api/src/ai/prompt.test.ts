import { describe, expect, test } from "bun:test";
import type { FlowDocumentInput } from "@automator/contracts";
import { withoutPositions } from "./draft";
import { systemPrompt, userTurn } from "./prompt";
import { canvasTools } from "./tools";

const document: FlowDocumentInput = {
  version: 1,
  name: "Ping",
  description: "",
  nodes: [{ id: "t", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Run", config: {} }],
  edges: [],
};

describe("system prompt", () => {
  test("names every tool the agent may call", () => {
    const prompt = systemPrompt();
    for (const name of canvasTools.map((tool) => tool.name)) expect(prompt).toContain(name);
    expect(canvasTools.map((tool) => tool.name)).toEqual([
      "add_node",
      "update_node",
      "remove_node",
      "connect",
      "disconnect",
      "set_flow",
      "add_test",
      "ask_user",
      "suggest_next",
    ]);
  });

  test("lists the node types and says there are no data tables", () => {
    const prompt = systemPrompt();
    expect(prompt).toContain("- trigger.manual:");
    expect(prompt).toContain("has no data tables");
  });
});

describe("user turn", () => {
  test("carries the selection and the builder's problems", () => {
    const text = userTurn("fix it", undefined, {
      selection: ["t"],
      problems: [{ severity: "error", nodeId: "t", message: '"Run": needs an edge' }],
    });
    expect(text).toContain("Selected nodes: t");
    expect(text).toContain('"Run": needs an edge');
    expect(text).toContain("The canvas is empty");
    expect(text).toContain("Request: fix it");
  });

  test("carries the current flow without positions", () => {
    const text = userTurn("rename it", document, undefined);
    expect(text).toContain(JSON.stringify(withoutPositions(document)));
    expect(text).not.toContain("The canvas is empty");
  });

  test("describes a failed run and names the node to explain", () => {
    const text = userTurn("why did it fail?", document, {
      run: {
        status: "failed",
        trigger: { nodeId: "t", payload: { source: "manual" } },
        nodes: [
          { nodeId: "t", status: "succeeded", outputs: { run: { ok: true } } },
          { nodeId: "d", status: "failed", error: "Discord answered 404" },
        ],
      },
    });
    expect(text).toContain(
      'The run failed. It was started by t with the payload {"source":"manual"}',
    );
    expect(text).toContain("- t: succeeded; outputs:");
    expect(text).toContain("- d: failed; error: Discord answered 404");
    expect(text).toContain("Explain node d: why it failed and how to fix it.");
    expect(text).toContain("make it with the tools");
  });

  test("asks what happened when the named node did not fail", () => {
    const text = userTurn("what did this do?", document, {
      run: {
        status: "succeeded",
        trigger: { nodeId: "t" },
        nodes: [{ nodeId: "t", status: "succeeded" }],
        nodeId: "t",
      },
    });
    expect(text).toContain("Explain what happened at node t.");
  });
});
