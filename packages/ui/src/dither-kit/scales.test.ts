import { describe, expect, test } from "bun:test";
import { buildYScale } from "./scales";

describe("buildYScale", () => {
  test("its top gridline sits at or above the tallest value", () => {
    /* A day of 122 runs used to draw above a 100 top tick: the domain was niced for ten
     * ticks (130) while the axis and grid drew four (0, 50, 100). */
    for (const max of [3, 7, 40, 99, 100, 101, 122, 125, 199, 500, 1234]) {
      const y = buildYScale(0, max, 100);
      const ticks = y.ticks(4);
      const top = ticks.at(-1)!;
      expect(top).toBeGreaterThanOrEqual(max);
      expect(y.domain()[1]).toBe(top);
    }
  });

  test("rounds 122 up to a 150 top tick in steps of 50", () => {
    expect(buildYScale(0, 122, 100).ticks(4)).toEqual([0, 50, 100, 150]);
  });

  test("nices the domain for the tick count it is given", () => {
    const y = buildYScale(0, 122, 100, 10);
    expect(y.domain()).toEqual([0, 130]);
    expect(y.ticks(10).at(-1)).toBe(130);
  });

  test("keeps a zero baseline and a finite span for flat data", () => {
    expect(buildYScale(0, 0, 100).domain()).toEqual([0, 1]);
    expect(buildYScale(-5, 0, 100).domain()[0]).toBeLessThanOrEqual(-5);
  });
});
