import { describe, expect, test } from "bun:test";
import { describeTrigger, documentTriggers } from "./flow-triggers";
import type { FlowNodeType } from "./flows";

function node(type: FlowNodeType, config: Record<string, unknown> = {}, id = "n1") {
  return { id, type, config };
}

describe("describeTrigger", () => {
  test("a schedule reads as its interval", () => {
    expect(describeTrigger(node("trigger.schedule", { every: "15m" }))).toEqual({
      nodeId: "n1",
      type: "trigger.schedule",
      summary: "every 15m",
    });
  });

  test("a schedule without an interval falls back to the config default", () => {
    expect(describeTrigger(node("trigger.schedule"))?.summary).toBe("every 1h");
  });

  test("a price watch names the pair, the comparison and the threshold", () => {
    const trigger = node("trigger.price", {
      pair: "ETH / USD",
      comparison: "below",
      threshold: "2000",
    });
    expect(describeTrigger(trigger)?.summary).toBe("when ETH / USD is below 2,000");
  });

  test("a price watch spells out a two-word comparison", () => {
    const trigger = node("trigger.price", { comparison: "at_or_above", threshold: "4000" });
    expect(describeTrigger(trigger)?.summary).toBe("when ETH / USD is at or above 4,000");
  });

  test("a balance watch shortens the wallet it watches", () => {
    const trigger = node("trigger.balance", {
      address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      comparison: "below",
      threshold: "1",
    });
    expect(describeTrigger(trigger)?.summary).toBe("when 0xd8dA…6045 holds below 1");
  });

  test("an onchain event names the event and the contract", () => {
    const trigger = node("trigger.onchain-event", {
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      event: "Transfer(address indexed from, address indexed to, uint256 value)",
    });
    expect(describeTrigger(trigger)?.summary).toBe("on Transfer from 0x8335…2913");
  });

  test("the triggers without settings still read as sentences", () => {
    expect(describeTrigger(node("trigger.webhook"))?.summary).toBe("when its webhook is called");
    expect(describeTrigger(node("trigger.manual"))?.summary).toBe("when you run it");
    expect(describeTrigger(node("trigger.miniapp-open"))?.summary).toBe(
      "when someone opens the app",
    );
  });

  test("the World verification trigger reads as a sentence too", () => {
    expect(describeTrigger(node("world.verification-completed"))?.summary).toBe(
      "when a World ID check completes",
    );
  });

  test("a node that does not start a flow has no summary", () => {
    expect(describeTrigger(node("onchain.transfer-token"))).toBeNull();
  });
});

describe("documentTriggers", () => {
  test("keeps the triggers in document order and drops everything else", () => {
    const triggers = documentTriggers([
      node("trigger.schedule", { every: "6h" }, "a"),
      node("ai.generate-text", {}, "b"),
      node("trigger.webhook", {}, "c"),
    ]);
    expect(triggers).toEqual([
      { nodeId: "a", type: "trigger.schedule", summary: "every 6h" },
      { nodeId: "c", type: "trigger.webhook", summary: "when its webhook is called" },
    ]);
  });

  test("tolerates nodes stored without a config", () => {
    expect(documentTriggers([{ id: "a", type: "trigger.schedule" }])).toEqual([
      { nodeId: "a", type: "trigger.schedule", summary: "every 1h" },
    ]);
  });
});
