import { describe, expect, test } from "bun:test";
import { conditionOperators, isOrderingOperator, orderingOperators } from "./condition-operators";

describe("condition operators", () => {
  test("thresholds can be expressed both ways", () => {
    expect(conditionOperators).toContain("greater_or_equal");
    expect(conditionOperators).toContain("less_or_equal");
  });

  test("each inclusive operator sits next to its strict counterpart, so the dropdown reads in order", () => {
    const order = [...conditionOperators];
    expect(order.indexOf("greater_or_equal")).toBe(order.indexOf("greater_than") + 1);
    expect(order.indexOf("less_or_equal")).toBe(order.indexOf("less_than") + 1);
  });

  test("only the ordering operators demand numbers", () => {
    expect([...orderingOperators]).toEqual([
      "greater_than",
      "greater_or_equal",
      "less_than",
      "less_or_equal",
    ]);
    for (const operator of conditionOperators)
      expect(isOrderingOperator(operator)).toBe(
        (orderingOperators as readonly string[]).includes(operator),
      );
  });
});
