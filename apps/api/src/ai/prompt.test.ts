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
});
