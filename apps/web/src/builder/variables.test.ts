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

  test("expands a form's fields when the form feeds the node directly, object last", () => {
    expect(listVariables("save", nodes, edges).slice(0, 2)).toEqual([
      { template: "{{input.value.email}}", source: "Node form", label: "Email", kind: "text" },
      { template: "{{input.value}}", source: "Node form", label: "Submitted", kind: "object" },
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
    const login = { source: "Node login", kind: "text" } as const;
    expect(listVariables("verify", identity, wires).slice(0, 5)).toEqual([
      { template: "{{input.visitor.userId}}", ...login, label: "User id" },
      { template: "{{input.visitor.email}}", ...login, label: "Email" },
      { template: "{{input.visitor.wallet}}", ...login, label: "Wallet" },
      { template: "{{input.visitor.loginMethod}}", ...login, label: "Login method" },
      {
        template: "{{input.visitor}}",
        source: "Node login",
        label: "User details",
        kind: "object",
      },
    ]);
    const options = listVariables("d", identity, wires);
    expect(options).toContainEqual({
      template: "{{input.message.nullifierHash}}",
      source: "Node verify",
      label: "Nullifier hash",
      kind: "text",
    });
    expect(options).toContainEqual({
      template: "{{vars.visitor.email}}",
      source: "Node login",
      label: "Email",
      kind: "text",
    });
  });

  test("offers a balance's amount as a number before the object it sits in", () => {
    const graph = [
      node("t", "trigger.manual"),
      node("bal", "usdc.balance"),
      node("if", "logic.condition"),
    ];
    const wires = [
      { source: "t", target: "bal", sourceHandle: "run", targetHandle: "in" },
      { source: "bal", target: "if", sourceHandle: "balance", targetHandle: "value" },
    ];
    // The numeric leaf leads: {{input.value}} is an object, and Number({…}) is NaN forever.
    expect(listVariables("if", graph, wires).slice(0, 4)).toEqual([
      {
        template: "{{input.value.formatted}}",
        source: "Node bal",
        label: "Balance",
        kind: "number",
      },
      {
        template: "{{input.value.raw}}",
        source: "Node bal",
        label: "Balance in base units",
        kind: "number",
      },
      {
        template: "{{input.value.address}}",
        source: "Node bal",
        label: "Wallet address",
        kind: "text",
      },
      {
        template: "{{input.value}}",
        source: "Node bal",
        label: "Balance details",
        kind: "object",
      },
    ]);
  });

  test("carries a shape through a condition, the way the bundled example writes it by hand", () => {
    // usdc-balance-alert reads {{input.message.formatted}} after its condition; the True port
    // hands on the balance the condition read, so its leaves have to survive the step.
    const graph = [
      node("start", "trigger.manual"),
      node("balance", "usdc.balance"),
      node("check", "logic.condition"),
      node("notify", "notify.discord"),
    ];
    const wires = [
      { source: "start", target: "balance", sourceHandle: "run", targetHandle: "wallet" },
      { source: "balance", target: "check", sourceHandle: "balance", targetHandle: "value" },
      { source: "check", target: "notify", sourceHandle: "true", targetHandle: "message" },
    ];
    expect(listVariables("notify", graph, wires).slice(0, 4)).toEqual([
      {
        template: "{{input.message.formatted}}",
        source: "Node check",
        label: "Balance",
        kind: "number",
      },
      {
        template: "{{input.message.raw}}",
        source: "Node check",
        label: "Balance in base units",
        kind: "number",
      },
      {
        template: "{{input.message.address}}",
        source: "Node check",
        label: "Wallet address",
        kind: "text",
      },
      { template: "{{input.message}}", source: "Node check", label: "True", kind: "object" },
    ]);
  });

  test("expands the receipts, wallets and deliveries other nodes hand on", () => {
    const templates = (type: FlowNode["type"], handle: string) =>
      listVariables(
        "x",
        [node("s", type), node("x", "notify.discord")],
        [{ source: "s", target: "x", sourceHandle: handle, targetHandle: "message" }],
      ).map((option) => option.template);

    expect(templates("usdc.payout", "receipt")).toEqual([
      "{{input.message.amount}}",
      "{{input.message.to}}",
      "{{input.message.hash}}",
      "{{input.message.token}}",
      "{{input.message.simulated}}",
      "{{input.message}}",
    ]);
    expect(templates("privy.wallet", "wallet")).toEqual([
      "{{input.message.address}}",
      "{{input.message.chainId}}",
      "{{input.message.chainName}}",
      "{{input.message}}",
    ]);
    expect(templates("notify.email", "sent")).toEqual([
      "{{input.message.id}}",
      "{{input.message.to}}",
      "{{input.message}}",
    ]);
    // A port whose value only the run knows still offers itself, and nothing invented.
    expect(templates("ai.generate-text", "text")).toEqual(["{{input.message}}"]);
    expect(templates("logic.run-code", "output")).toEqual(["{{input.message}}"]);
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
      { template: "{{trigger}}", source: "Node w", label: "Payload", kind: "object" },
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
      { template: "{{trigger}}", source: "Node w", label: "Payload", kind: "object" },
      { template: "{{trigger.method}}", source: "Node w", label: "method" },
      { template: "{{trigger.headers}}", source: "Node w", label: "headers" },
      { template: "{{trigger.query}}", source: "Node w", label: "query" },
      { template: "{{trigger.body}}", source: "Node w", label: "body" },
    ]);
  });
  test("expands a found record's columns for a find-records node upstream", () => {
    const table = {
      id: "tbl_customers",
      columns: [
        { id: "email", name: "Email" },
        { id: "plan", name: "Plan" },
      ],
    };
    const graph = [
      node("t", "trigger.webhook"),
      node("find", "data.find-records", { tableId: "tbl_customers" }),
      node("d", "notify.discord"),
    ];
    const wires = [
      { source: "t", target: "find", targetHandle: "query" },
      { source: "find", target: "d", sourceHandle: "found", targetHandle: "message" },
    ];
    expect(listVariables("d", graph, wires, [], [table]).slice(0, 5)).toEqual([
      {
        template: "{{input.message.count}}",
        source: "Node find",
        label: "Match count",
        kind: "number",
      },
      {
        template: "{{input.message.first.id}}",
        source: "Node find",
        label: "Record id",
        kind: "text",
      },
      { template: "{{input.message.first.values.email}}", source: "Node find", label: "Email" },
      { template: "{{input.message.first.values.plan}}", source: "Node find", label: "Plan" },
      { template: "{{input.message}}", source: "Node find", label: "Found", kind: "object" },
    ]);
    // The empty branch carries no record, and an unlisted table offers no columns.
    expect(
      listVariables(
        "d",
        graph,
        [wires[0]!, { ...wires[1]!, sourceHandle: "empty" }],
        [],
        [table],
      ).slice(0, 1),
    ).toEqual([{ template: "{{input.message}}", source: "Node find", label: "Empty" }]);
    expect(listVariables("d", graph, wires, [], []).slice(0, 1)).toEqual([
      { template: "{{input.message}}", source: "Node find", label: "Found" },
    ]);
  });

  test("expands a written record's columns for a create-record node upstream", () => {
    const graph = [
      node("t", "trigger.webhook"),
      node("make", "data.create-record", { tableId: "tbl_customers" }),
      node("d", "notify.discord"),
    ];
    const wires = [
      { source: "t", target: "make", targetHandle: "values" },
      { source: "make", target: "d", sourceHandle: "record", targetHandle: "message" },
    ];
    const tables = [{ id: "tbl_customers", columns: [{ id: "email", name: "Email" }] }];
    expect(listVariables("d", graph, wires, [], tables).slice(0, 3)).toEqual([
      { template: "{{input.message.id}}", source: "Node make", label: "Record id", kind: "text" },
      { template: "{{input.message.values.email}}", source: "Node make", label: "Email" },
      { template: "{{input.message}}", source: "Node make", label: "Record", kind: "object" },
    ]);
  });
});
