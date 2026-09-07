import { describe, expect, test } from "bun:test";
import { compare } from "./compare";

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

  test("numeric comparisons coerce", () => {
    expect(compare("10", "greater_than", 9)).toBe(true);
    expect(compare("abc", "greater_than", 1)).toBe(false);
    expect(compare(1, "less_than", "2")).toBe(true);
  });

  test("emptiness covers nullish, blank, empty arrays and objects", () => {
    for (const value of [undefined, null, "", [], {}])
      expect(compare(value, "is_empty", "")).toBe(true);
    for (const value of [0, false, "a", [1], { a: 1 }])
      expect(compare(value, "is_not_empty", "")).toBe(true);
  });
});
