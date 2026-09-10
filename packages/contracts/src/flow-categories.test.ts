import { describe, expect, test } from "bun:test";
import { flowNodeCategories, flowNodeCategory, isTriggerNodeType } from "./flow-categories";
import { flowNodeTypes } from "./flows";

describe("flowNodeCategory", () => {
  test("names a known category for every node type, and nothing else", () => {
    expect(Object.keys(flowNodeCategory).sort()).toEqual([...flowNodeTypes].sort());
    for (const type of flowNodeTypes) expect(flowNodeCategories).toContain(flowNodeCategory[type]);
  });

  test("the types that can start a flow are exactly the trigger category", () => {
    expect(flowNodeTypes.filter(isTriggerNodeType)).toEqual([
      "trigger.schedule",
      "trigger.onchain-event",
      "trigger.price",
      "trigger.balance",
      "trigger.webhook",
      "trigger.api",
      "trigger.miniapp-open",
      "trigger.manual",
      "world.verification-completed",
    ]);
  });

  test("the cases a prefix split would get wrong are the ones that matter", () => {
    // Same "world." prefix, opposite answers.
    expect(isTriggerNodeType("world.verification-completed")).toBe(true);
    expect(isTriggerNodeType("world.id-verify")).toBe(false);
    expect(flowNodeCategory["world.id-verify"]).toBe("integration");
    // Moves value onchain but sits with the integrations, as the canvas groups it.
    expect(flowNodeCategory["usdc.payout"]).toBe("integration");
    expect(flowNodeCategory["privy.login"]).toBe("integration");
  });
});
