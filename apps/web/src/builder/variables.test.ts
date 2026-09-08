import type { FlowNode } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { listVariables } from "./variables";

function node(id: string, type: FlowNode["type"], config: Record<string, unknown> = {}): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, label: `Node ${id}`, config };
}

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

  test("expands an identity screen's answer and keeps the visitor in vars after a login", () => {
    const identity = [
      node("t", "trigger.miniapp-open"),
      node("login", "privy.login"),
      node("verify", "world.id-verify"),
      node("d", "notify.discord"),
    ];
    const wires = [
      { source: "t", target: "login", sourceHandle: "visitor", targetHandle: "visitor" },
      { source: "login", target: "verify", sourceHandle: "user", targetHandle: "visitor" },
      { source: "verify", target: "d", sourceHandle: "verified", targetHandle: "message" },
    ];
    expect(listVariables("verify", identity, wires).slice(0, 5)).toEqual([
      { template: "{{input.visitor}}", source: "Node login", label: "User" },
      { template: "{{input.visitor.userId}}", source: "Node login", label: "User id" },
      { template: "{{input.visitor.email}}", source: "Node login", label: "Email" },
      { template: "{{input.visitor.wallet}}", source: "Node login", label: "Wallet" },
      { template: "{{input.visitor.loginMethod}}", source: "Node login", label: "Login method" },
    ]);
    const options = listVariables("d", identity, wires);
    expect(options).toContainEqual({
      template: "{{input.message.nullifierHash}}",
      source: "Node verify",
      label: "Nullifier hash",
    });
    expect(options).toContainEqual({
      template: "{{vars.visitor.email}}",
      source: "Node login",
      label: "Email",
    });
  });

  test("is empty for a node with nothing upstream", () => {
    expect(listVariables("t", nodes, edges)).toEqual([]);
  });

  test("appends the user's secrets after everything else", () => {
    expect(listVariables("t", nodes, edges, ["hook"])).toEqual([
      { template: "{{secrets.hook}}", source: "Secrets", label: "hook" },
    ]);
  });

  test("offers the trigger's sample payload keys after the whole payload", () => {
    const options = listVariables(
      "x",
      [
        node("w", "trigger.webhook", {
          samplePayload: '{"method":"POST","body":{"id":1},"bad key":1}',
        }),
        node("x", "notify.discord"),
      ],
      [{ source: "w", target: "x" }],
    );
    expect(options.slice(1)).toEqual([
      { template: "{{trigger}}", source: "Node w", label: "Payload" },
      { template: "{{trigger.method}}", source: "Node w", label: "method" },
      { template: "{{trigger.body}}", source: "Node w", label: "body" },
    ]);
  });

  test("does not repeat a sample key the trigger already offers", () => {
    const options = listVariables(
      "x",
      [
        node("t", "trigger.miniapp-open", { samplePayload: '{"openedAt":"now","ref":"qr"}' }),
        node("x", "notify.discord"),
      ],
      [{ source: "t", target: "x" }],
    );
    expect(options.slice(1)).toEqual([
      { template: "{{trigger.openedAt}}", source: "Node t", label: "Opened at" },
      { template: "{{trigger.ref}}", source: "Node t", label: "ref" },
    ]);
  });

  test("falls back to the default input handle and the trigger's default sample keys", () => {
    const options = listVariables(
      "x",
      [node("w", "trigger.webhook"), node("x", "notify.discord")],
      [{ source: "w", target: "x" }],
    );
    expect(options).toEqual([
      { template: "{{input.input}}", source: "Node w", label: "Output" },
      { template: "{{trigger}}", source: "Node w", label: "Payload" },
      { template: "{{trigger.method}}", source: "Node w", label: "method" },
      { template: "{{trigger.headers}}", source: "Node w", label: "headers" },
      { template: "{{trigger.query}}", source: "Node w", label: "query" },
      { template: "{{trigger.body}}", source: "Node w", label: "body" },
    ]);
  });
});
