import { describe, expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import {
  aiErrorDetail,
  aiErrorDetailMaxLength,
  aiFlowTestSchema,
  explainRunContract,
  generateFlowContract,
  generateFlowResponseSchema,
  redactRunOutputs,
  redactSensitiveText,
  redactSensitiveValue,
  redactedValue,
} from "./ai";

const document = {
  version: 1,
  name: "Ping",
  description: "",
  nodes: [{ id: "n1", type: "trigger.manual", position: { x: 0, y: 0 }, label: "Run", config: {} }],
  edges: [],
};

describe("AI contracts", () => {
  test("a generate request may carry a capped history of user and assistant turns", () => {
    expect(Value.Check(generateFlowContract.body, { prompt: "x" })).toBe(true);
    expect(
      Value.Check(generateFlowContract.body, {
        prompt: "also notify Discord",
        document,
        history: [
          { role: "user", text: "make a webhook flow" },
          { role: "assistant", text: "A webhook posts to Discord." },
        ],
      }),
    ).toBe(true);
    expect(
      Value.Check(generateFlowContract.body, {
        prompt: "x",
        history: [{ role: "system", text: "" }],
      }),
    ).toBe(false);
    expect(
      Value.Check(generateFlowContract.body, {
        prompt: "x",
        history: Array.from({ length: 41 }, () => ({ role: "user", text: "hi" })),
      }),
    ).toBe(false);
  });

  test("the answer is a flow with a summary or a message", () => {
    expect(
      Value.Check(generateFlowResponseSchema, { kind: "flow", document, summary: "Done." }),
    ).toBe(true);
    expect(Value.Check(generateFlowResponseSchema, { kind: "message", text: "Which chain?" })).toBe(
      true,
    );
    expect(Value.Check(generateFlowResponseSchema, { document, summary: "Done." })).toBe(false);
    expect(Value.Check(generateFlowResponseSchema, { kind: "message" })).toBe(false);
  });

  test("an explain request carries the document, the run's node results and the failed node", () => {
    const body = {
      document,
      run: {
        status: "failed",
        trigger: { nodeId: "n1", payload: {} },
        nodes: [{ nodeId: "n1", status: "failed", error: "boom" }],
      },
      nodeId: "n1",
    };
    expect(Value.Check(explainRunContract.body, body)).toBe(true);
    expect(Value.Check(explainRunContract.body, { document })).toBe(false);
    expect(explainRunContract.path).toBe("/ai/runs/explain");
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
    expect(long.endsWith("\u2026")).toBe(true);
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
