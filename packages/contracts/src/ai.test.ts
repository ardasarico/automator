import { describe, expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import {
  aiErrorDetail,
  aiErrorDetailMaxLength,
  aiFlowTestSchema,
  aiMessageSchema,
  aiStreamEventSchema,
  redactRunOutputs,
  redactSensitiveText,
  redactSensitiveValue,
  redactedValue,
  sendAiMessageRequestSchema,
  setAiProposalStateContract,
} from "./ai";

describe("ai message contracts", () => {
  const document = {
    version: 1 as const,
    name: "Ping",
    description: "",
    nodes: [
      { id: "n1", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Run", config: {} },
    ],
    edges: [],
  };

  test("a message is a role, ordered parts and a timestamp", () => {
    expect(
      Value.Check(aiMessageSchema, {
        id: "m1",
        role: "assistant",
        createdAt: "2026-09-11T00:00:00.000Z",
        parts: [
          { type: "text", text: "Added a trigger." },
          {
            type: "tool",
            id: "c1",
            name: "add_node",
            args: { id: "n1" },
            ok: true,
            detail: "Added n1",
          },
          {
            type: "question",
            text: "Which chain?",
            options: ["Base Sepolia", "World Chain Sepolia"],
          },
          {
            type: "proposal",
            document,
            verification: { checks: [], warnings: [] },
            replaces: true,
            state: "pending",
          },
          { type: "suggestions", items: ["Add a Discord message"] },
          { type: "error", error: "unavailable" },
        ],
      }),
    ).toBe(true);
    expect(
      Value.Check(aiMessageSchema, { id: "m1", role: "system", parts: [], createdAt: "x" }),
    ).toBe(false);
  });

  test("stream events are discriminated by type", () => {
    for (const event of [
      { type: "message", id: "m2" },
      { type: "text.delta", delta: "Add" },
      { type: "tool.call", id: "c1", name: "add_node", args: {} },
      { type: "tool.result", id: "c1", ok: false, detail: 'Unknown node type "x"' },
      { type: "tool.result", id: "c1", ok: true, detail: "Added n1", document },
      { type: "status", phase: "checking" },
      { type: "question", text: "Which chain?", options: ["Base Sepolia"] },
      { type: "proposal", document, verification: { checks: [], warnings: [] }, replaces: false },
      { type: "suggestions", items: ["Add a test"] },
      { type: "error", error: "invalid_flow", detail: "No trigger" },
      { type: "done" },
    ])
      expect(Value.Check(aiStreamEventSchema, event), JSON.stringify(event)).toBe(true);
    expect(Value.Check(aiStreamEventSchema, { type: "tool.call", id: "c1" })).toBe(false);
  });

  test("a send request needs text and bounds its context", () => {
    expect(Value.Check(sendAiMessageRequestSchema, { text: "hi" })).toBe(true);
    expect(
      Value.Check(sendAiMessageRequestSchema, {
        text: "fix these",
        document,
        context: {
          selection: ["n1"],
          problems: [{ severity: "error", message: "No trigger" }],
        },
      }),
    ).toBe(true);
    expect(Value.Check(sendAiMessageRequestSchema, { text: "" })).toBe(false);
    expect(Value.Check(sendAiMessageRequestSchema, { text: "x".repeat(4001) })).toBe(false);
  });

  test("the proposal state route takes only applied or discarded", () => {
    expect(Value.Check(setAiProposalStateContract.body, { state: "applied" })).toBe(true);
    expect(Value.Check(setAiProposalStateContract.body, { state: "stale" })).toBe(false);
  });
});

describe("redaction", () => {
  test("replaces placeholders, webhook URLs, tokens and long keys but keeps addresses and hashes", () => {
    const address = "0x2222222222222222222222222222222222222222";
    const hash = `0x${"ab".repeat(32)}`;
    const key = `0x${"cd".repeat(33)}`;
    const text = `sent {{secrets.discord}} to https://discord.com/api/webhooks/123/abcDEF from ${address} tx ${hash} key ${key} Bearer abcdefghijklmnopqrstuvwxyz jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc bare ${"ef".repeat(32)}`;
    const redacted = redactSensitiveText(text);
    expect(redacted).toContain(address);
    expect(redacted).toContain(hash);
    expect(redacted).not.toContain(key);
    expect(redacted).not.toContain("secrets.discord");
    expect(redacted).not.toContain("discord.com/api/webhooks");
    expect(redacted).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(redacted).not.toContain("eyJhbGci");
    expect(redacted).not.toContain("ef".repeat(32));
    expect(redacted.split(redactedValue).length - 1).toBe(6);
    expect(redactSensitiveText("Discord message needs a Discord webhook URL")).toBe(
      "Discord message needs a Discord webhook URL",
    );
  });

  test("replaces credential-looking fields and visits nested values", () => {
    expect(
      redactSensitiveValue({
        apiKey: "plain",
        token: "",
        nested: [{ authorization: "Bearer x", text: "ok {{secrets.a}}" }],
        amount: 3,
      }),
    ).toEqual({
      apiKey: redactedValue,
      token: "",
      nested: [{ authorization: redactedValue, text: `ok ${redactedValue}` }],
      amount: 3,
    });
  });

  test("redactRunOutputs covers outputs, errors and the trigger payload without mutating", () => {
    const run = {
      status: "failed" as const,
      trigger: { nodeId: "n1", payload: { secret: "s3cret" } },
      error: "sent {{secrets.x}}",
      nodes: [
        { nodeId: "n1", status: "succeeded" as const, outputs: { run: { token: "abc" } } },
        { nodeId: "n2", status: "failed" as const, error: "bad {{secrets.y}}" },
      ],
    };
    const copy = structuredClone(run);
    const redacted = redactRunOutputs(run);
    expect(run).toEqual(copy);
    expect(redacted.trigger.payload).toEqual({ secret: redactedValue });
    expect(redacted.error).toBe(`sent ${redactedValue}`);
    expect(redacted.nodes[0]!.outputs).toEqual({ run: { token: redactedValue } });
    expect(redacted.nodes[1]!.error).toBe(`bad ${redactedValue}`);
  });

  test("aiErrorDetail redacts, collapses to one line and bounds the length", () => {
    expect(aiErrorDetail("Scenario:\n  n2.value expected 1, got {{secrets.hook}}")).toBe(
      `Scenario: n2.value expected 1, got ${redactedValue}`,
    );
    expect(aiErrorDetail("   ")).toBeUndefined();
    const long = aiErrorDetail("x".repeat(1000))!;
    expect(long.length).toBe(aiErrorDetailMaxLength);
    expect(long.endsWith("…")).toBe(true);
  });

  test("an expectation may compare with equals, greaterThan, lessThan or contains", () => {
    const scenario = (expectation: unknown) => ({ name: "Balance", expect: [expectation] });
    expect(Value.Check(aiFlowTestSchema, scenario({ nodeId: "n2" }))).toBe(true);
    expect(
      Value.Check(aiFlowTestSchema, scenario({ nodeId: "n2", output: "value", greaterThan: 10 })),
    ).toBe(true);
    expect(
      Value.Check(aiFlowTestSchema, scenario({ nodeId: "n2", output: "value", contains: "USDC" })),
    ).toBe(true);
    expect(
      Value.Check(aiFlowTestSchema, scenario({ nodeId: "n2", output: "value", greaterThan: "10" })),
    ).toBe(false);
  });
});
