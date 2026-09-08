import { describe, expect, test } from "bun:test";
import {
  WatchConfigError,
  comparisonMet,
  crossed,
  formatDecimal,
  parseDecimal,
  thresholdMet,
} from "./threshold";

describe("parseDecimal", () => {
  test.each([
    ["4000", 8, "400000000000"],
    ["0.5", 18, "500000000000000000"],
    ["1", 6, "1000000"],
    [".25", 2, "25"],
    ["12.", 2, "1200"],
    ["-3.5", 1, "-35"],
    ["0", 18, "0"],
  ])("%s at %d decimals", (text, decimals, expected) => {
    expect(parseDecimal(text, decimals).toString()).toBe(expected);
  });

  test("truncates a fraction longer than the scale rather than rounding", () => {
    expect(parseDecimal("1.999", 2).toString()).toBe("199");
  });

  test.each(["", "  ", "abc", "1.2.3", "1,5", "-", ".", "-."])("rejects %p", (text) => {
    expect(() => parseDecimal(text, 8)).toThrow(WatchConfigError);
  });

  test("names the field it could not read", () => {
    expect(() => parseDecimal("x", 8, "price")).toThrow("The price is not a number: x");
  });
});

describe("formatDecimal", () => {
  test.each([
    [BigInt("387542000000"), 8, "3875.42"],
    [BigInt("500000000000000000"), 18, "0.5"],
    [BigInt(0), 18, "0"],
    [BigInt(1), 18, "0.000000000000000001"],
    [BigInt(-35), 1, "-3.5"],
    [BigInt(42), 0, "42"],
  ])("%s at %d decimals", (raw, decimals, expected) => {
    expect(formatDecimal({ raw, decimals })).toBe(expected);
  });

  test("round-trips a threshold through the scale", () => {
    const decimals = 8;
    expect(formatDecimal({ raw: parseDecimal("4000.25", decimals), decimals })).toBe("4000.25");
  });

  test("keeps precision a float would lose", () => {
    const raw = BigInt("123456789012345678901");
    expect(formatDecimal({ raw, decimals: 18 })).toBe("123.456789012345678901");
  });
});

describe("comparisonMet", () => {
  const threshold = BigInt(100);
  test.each([
    ["below", BigInt(99), true],
    ["below", BigInt(100), false],
    ["at_or_below", BigInt(100), true],
    ["at_or_below", BigInt(101), false],
    ["above", BigInt(101), true],
    ["above", BigInt(100), false],
    ["at_or_above", BigInt(100), true],
    ["at_or_above", BigInt(99), false],
  ] as const)("%s %s", (comparison, value, expected) => {
    expect(comparisonMet(comparison, value, threshold)).toBe(expected);
  });
});

describe("crossed", () => {
  test("fires on the first poll of a condition that already holds", () => {
    expect(crossed(undefined, true)).toBe(true);
  });
  test("fires when the condition turns true", () => {
    expect(crossed(false, true)).toBe(true);
  });
  test("stays quiet while the condition keeps holding", () => {
    expect(crossed(true, true)).toBe(false);
  });
  test("never fires while the condition is false", () => {
    expect(crossed(true, false)).toBe(false);
    expect(crossed(false, false)).toBe(false);
    expect(crossed(undefined, false)).toBe(false);
  });
});

describe("thresholdMet", () => {
  test.each([
    ["below", "1.001", true],
    ["at_or_below", "0.999", false],
    ["above", "0.999", true],
    ["at_or_above", "1.001", false],
  ] as const)("preserves extra threshold digits for %s", (comparison, threshold, expected) => {
    expect(thresholdMet(comparison, { raw: BigInt(100), decimals: 2 }, threshold)).toBe(expected);
  });
  test.each([-1, 1.5, 256, Infinity, NaN])("rejects invalid decimal count %s", (decimals) => {
    expect(() => thresholdMet("below", { raw: BigInt(1), decimals }, "2")).toThrow(
      WatchConfigError,
    );
  });
});
