import { describe, expect, test } from "bun:test";
import { describeNode } from "./flow-summaries";
import type { FlowNodeType } from "./flows";

function node(type: FlowNodeType, config: Record<string, unknown> = {}) {
  return { id: "n1", type, config };
}

describe("describeNode", () => {
  test("a trigger reuses its trigger sentence", () => {
    expect(describeNode(node("trigger.miniapp-open"))).toBe("when someone opens the app");
    expect(describeNode(node("trigger.schedule", { every: "15m" }))).toBe("every 15m");
  });

  test("a condition reads as its comparison with the template braces stripped", () => {
    expect(
      describeNode(
        node("logic.condition", {
          left: "{{input.amount}}",
          operator: "greater_or_equal",
          right: "10",
        }),
      ),
    ).toBe("input.amount ≥ 10");
  });

  test("a condition with no right side never prints an empty value", () => {
    expect(describeNode(node("logic.condition", { left: "{{input.value}}" }))).toBe(
      "input.value = …",
    );
    expect(
      describeNode(node("logic.condition", { left: "{{input.value}}", operator: "is_empty" })),
    ).toBe("input.value is empty");
  });

  test("a payment says how much it collects", () => {
    expect(describeNode(node("usdc.payment", { amount: "5" }))).toBe("collect 5 USDC");
    expect(describeNode(node("usdc.payment"))).toBe("collect … USDC");
  });

  test("a payout shortens the recipient address", () => {
    expect(
      describeNode(
        node("usdc.payout", { amount: "12.5", to: "0x1234567890abcdef1234567890abcdef12345678" }),
      ),
    ).toBe("12.5 USDC to 0x1234…5678");
  });

  test("a Discord message shows its content clipped to one line", () => {
    const content = "A very long announcement that goes on and on well past the card width";
    expect(describeNode(node("notify.discord", { content }))).toBe(
      "A very long announcement that goes on and on we…",
    );
    expect(describeNode(node("notify.discord"))).toBe("no message yet");
  });

  test("a form counts its fields next to its title", () => {
    expect(
      describeNode(node("screen.form", { title: "Sign up", fields: [{ id: "email" }, {}] })),
    ).toBe("Sign up · 2 fields");
    expect(describeNode(node("screen.form", { fields: [{ id: "email" }] }))).toBe("1 field");
  });

  test("a contract call names the function and the contract", () => {
    expect(
      describeNode(
        node("onchain.read-contract", {
          functionName: "balanceOf",
          address: "0x1234567890abcdef1234567890abcdef12345678",
        }),
      ),
    ).toBe("balanceOf() on 0x1234…5678");
    expect(describeNode(node("onchain.write-contract"))).toBe("no function set");
  });

  test("a return lists its output names", () => {
    expect(describeNode(node("logic.return", { outputs: [{ name: "price" }, { name: "" }] }))).toBe(
      "answers with price",
    );
    expect(describeNode(node("logic.return"))).toBe("answers with nothing yet");
  });

  test("a node with nothing worth stating returns null, never an empty string", () => {
    expect(describeNode(node("privy.login"))).toBeNull();
    expect(describeNode(node("screen.page"))).toBeNull();
    expect(describeNode(node("logic.merge"))).toBe("combine both inputs");
  });
});
