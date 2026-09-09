import { describe, expect, test } from "bun:test";
import { exactAmount, formatAmount } from "./amounts";

describe("formatAmount", () => {
  test("shortens a long fractional balance", () => {
    expect(formatAmount("0.062999769144958985")).toBe("0.063");
  });

  test("keeps whole units readable", () => {
    expect(formatAmount("20")).toBe("20");
    expect(formatAmount("1234.5678901")).toBe("1,234.5679");
  });

  test("reports zero as zero", () => {
    expect(formatAmount("0")).toBe("0");
    expect(formatAmount("0.0")).toBe("0");
  });

  test("never rounds dust down to zero", () => {
    expect(formatAmount("0.000000000000000001")).toBe("0.000000000000000001");
  });

  test("returns anything unparseable untouched", () => {
    expect(formatAmount("unavailable")).toBe("unavailable");
    expect(formatAmount("")).toBe("");
  });
});

describe("exactAmount", () => {
  test("offers the exact value only when digits were dropped", () => {
    expect(exactAmount("0.062999769144958985", "0.063")).toBe("0.062999769144958985");
    expect(exactAmount("20", "20")).toBeUndefined();
    expect(exactAmount("1234.5679", "1,234.5679")).toBeUndefined();
  });
});
