import type { FlowNode } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { listVariables } from "./variables";

function node(id: string, type: FlowNode["type"], config: Record<string, unknown> = {}): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, label: `Node ${id}`, config };
}

/** trigger → form → set-variable → discord, with an unrelated node wired after discord. */
const nodes = [
  node("t", "trigger.miniapp-open"),
  node("form", "screen.form", { fields: [{ id: "email", label: "Email" }, { id: "" }] }),
  node("save", "logic.set-variable", { name: "visitor" }),
  node("d", "notify.discord"),
  node("after", "logic.wait"),
];
const edges = [
  { source: "t", target: "form", sourceHandle: "visitor", targetHandle: "data" },
  { source: "form", target: "save", sourceHandle: "submitted", targetHandle: "value" },
  { source: "save", target: "d", sourceHandle: "value", targetHandle: "message" },
  { source: "d", target: "after", sourceHandle: "sent", targetHandle: "in" },
];

describe("listVariables", () => {
  test("lists the input port, upstream variables and the trigger for a node", () => {
    expect(listVariables("d", nodes, edges)).toEqual([
      { template: "{{input.message}}", source: "Node save", label: "Value" },
      { template: "{{vars.visitor}}", source: "Node save", label: "visitor" },
      { template: "{{trigger.openedAt}}", source: "Node t", label: "Opened at" },
    ]);
  });

  test("expands a form's fields when the form feeds the node directly", () => {
    expect(listVariables("save", nodes, edges).slice(0, 2)).toEqual([
      { template: "{{input.value}}", source: "Node form", label: "Submitted" },
      { template: "{{input.value.email}}", source: "Node form", label: "Email" },
    ]);
  });

  test("is empty for a node with nothing upstream", () => {
    expect(listVariables("t", nodes, edges)).toEqual([]);
  });

  test("appends the user's secrets after everything else", () => {
    expect(listVariables("t", nodes, edges, ["hook"])).toEqual([
      { template: "{{secrets.hook}}", source: "Secrets", label: "hook" },
    ]);
  });

  test("falls back to the default input handle and a generic trigger payload", () => {
    const options = listVariables(
      "x",
      [node("w", "trigger.webhook"), node("x", "notify.discord")],
      [{ source: "w", target: "x" }],
    );
    expect(options).toEqual([
      { template: "{{input.input}}", source: "Node w", label: "Output" },
      { template: "{{trigger}}", source: "Node w", label: "Payload" },
    ]);
  });
});
