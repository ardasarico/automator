import { describe, expect, test } from "bun:test";
import { ComparisonError, compare, compareForNode } from "./compare";
import { NodeExecutionError } from "./executor";

describe("compare", () => {
  test("equals compares strings and numbers loosely, objects structurally", () => {
    expect(compare("5", "equals", 5)).toBe(true);
    expect(compare({ a: 1 }, "equals", { a: 1 })).toBe(true);
    expect(compare("a", "not_equals", "b")).toBe(true);
  });

  test("contains checks text and arrays", () => {
    expect(compare("hello world", "contains", "world")).toBe(true);
    expect(compare(["x", 2], "contains", 2)).toBe(true);
    expect(compare(["x"], "contains", "y")).toBe(false);
  });

  test("numeric comparisons coerce numbers written as text", () => {
    expect(compare("10", "greater_than", 9)).toBe(true);
    expect(compare(1, "less_than", "2")).toBe(true);
    expect(compare(" 10 ", "greater_than", 9)).toBe(true);
  });

  test("greater_or_equal and less_or_equal include the boundary", () => {
    expect(compare(10, "greater_or_equal", "10")).toBe(true);
    expect(compare(10, "greater_or_equal", 11)).toBe(false);
    expect(compare("10", "less_or_equal", 10)).toBe(true);
    expect(compare(11, "less_or_equal", 10)).toBe(false);
  });

  test("an ordering operator refuses a value that is not a number instead of answering false", () => {
    // The reported bug: a balance node's whole output ordered against 10 answered false silently.
    const balance = { address: "0xabc", raw: "20000000", formatted: "20" };
    for (const operator of [
      "greater_than",
      "greater_or_equal",
      "less_than",
      "less_or_equal",
    ] as const)
      expect(() => compare(balance, operator, "10")).toThrow(ComparisonError);
    expect(compare(balance.formatted, "greater_than", "10")).toBe(true);
  });

  test("a blank, missing or unparseable operand refuses rather than counting as zero", () => {
    for (const value of [null, undefined, "", "   ", "abc", [1, 2], true])
      expect(() => compare(value, "greater_than", 1)).toThrow(ComparisonError);
    expect(() => compare(1, "less_than", "abc")).toThrow(ComparisonError);
  });

  test("the refusal names the side and the offending value's shape, never its content", () => {
    expect(() => compare({ formatted: "20" }, "greater_than", "10")).toThrow(
      /needs a number on the left, but got an object\. Compare one of its fields/,
    );
    expect(() => compare(1, "less_or_equal", "abc")).toThrow(/on the right, but got a string\./);
    expect(() => compare(null, "greater_than", 1)).toThrow(/but got null\./);
    expect(() => compare("", "greater_than", 1)).toThrow(/but got an empty string\./);
    expect(() => compare("  ", "greater_than", 1)).toThrow(/but got a blank string\./);
    expect(() => compare(true, "greater_than", 1)).toThrow(/but got a boolean\./);
    expect(() => compare([1, 2, 3], "greater_than", 1)).toThrow(/but got an array of 3 items\./);
    expect(() => compare(undefined, "greater_than", 1)).toThrow(/but got nothing\./);
  });

  test("a resolved secret used as an operand never reaches the persisted message", () => {
    const secret = "resolved-secret-4eC39HqLyjWDarjtT1zdp7dc";
    const message = (() => {
      try {
        compare(secret, "greater_than", 1);
        return "";
      } catch (error) {
        return (error as Error).message;
      }
    })();
    expect(message).toBe("“greater than” needs a number on the left, but got a string.");
    expect(message).not.toContain(secret);
    expect(message).not.toContain("4eC39");
  });

  test("lenient operators still answer for values an ordering operator would refuse", () => {
    expect(compare({ a: 1 }, "equals", { a: 1 })).toBe(true);
    expect(compare(null, "is_empty", "")).toBe(true);
    expect(compare("abc", "contains", "b")).toBe(true);
  });

  test("compareForNode turns a refusal into that node's failure", () => {
    expect(() => compareForNode("Condition", {}, "greater_than", "10")).toThrow(NodeExecutionError);
    expect(() => compareForNode("Condition", {}, "greater_than", "10")).toThrow(
      /^Condition: “greater than” needs a number on the left/,
    );
    expect(compareForNode("Condition", "11", "greater_than", "10")).toBe(true);
  });

  test("emptiness covers nullish, blank, empty arrays and objects", () => {
    for (const value of [undefined, null, "", [], {}])
      expect(compare(value, "is_empty", "")).toBe(true);
    for (const value of [0, false, "a", [1], { a: 1 }])
      expect(compare(value, "is_not_empty", "")).toBe(true);
  });
});
