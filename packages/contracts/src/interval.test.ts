import { describe, expect, test } from "bun:test";
import { defaultInterval, intervalFormats, intervalProblem, parseInterval } from "./interval";

describe("parseInterval", () => {
  test.each([
    ["1s", 1000],
    ["30s", 30_000],
    ["10m", 600_000],
    ["1h", 3_600_000],
    ["7d", 604_800_000],
    ["2d", 172_800_000],
    [" 5 M ", 300_000],
    ["1H", 3_600_000],
  ])("%s -> %d ms", (text, ms) => {
    expect(parseInterval(text)).toBe(ms);
  });

  test("the default the schedule trigger ships with parses", () => {
    expect(parseInterval(defaultInterval)).toBe(3_600_000);
  });

  test.each([
    "",
    "   ",
    "every Monday",
    "abc",
    "0h",
    "0",
    "1w",
    "-5m",
    "1.5h",
    "1h30m",
    "h",
    "999999999999999999999d",
  ])("rejects %p", (text) => {
    expect(parseInterval(text)).toBeNull();
  });

  test("a bare number is not an interval, so no unit is guessed for it", () => {
    expect(parseInterval("30")).toBeNull();
    expect(parseInterval("30m")).toBe(1_800_000);
  });
});

describe("intervalProblem", () => {
  test.each(["30s", "15m", "1h", "7d", " 5 M "])("%p has no problem", (text) => {
    expect(intervalProblem(text)).toBeNull();
  });

  test("each kind of unusable interval says what is wrong and how to fix it", () => {
    expect(intervalProblem("")).toBe(
      `has no interval, so it never fires. Use a whole number and a unit: ${intervalFormats}.`,
    );
    expect(intervalProblem("0h")).toBe(
      `has an interval of zero, so it never fires. Use a whole number and a unit: ${intervalFormats}.`,
    );
    expect(intervalProblem("30")).toBe(
      `has an interval with no unit ("30"), so it never fires. Use a whole number and a unit: ${intervalFormats}.`,
    );
    expect(intervalProblem("every Monday")).toBe(
      `has an interval the scheduler cannot read ("every Monday"), so it never fires. Use a whole number and a unit: ${intervalFormats}.`,
    );
  });

  test("the message names the value as typed, trimmed", () => {
    expect(intervalProblem("  weekly  ")).toContain('("weekly")');
  });
});
