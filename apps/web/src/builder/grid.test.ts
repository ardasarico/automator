import { describe, expect, test } from "bun:test";
import { gridSize, snapGrid, snapPosition } from "./grid";

describe("snapPosition", () => {
  test("rounds both axes to the nearest grid point", () => {
    expect(snapPosition({ x: 31, y: 49 })).toEqual({ x: 40, y: 40 });
    expect(snapPosition({ x: -11, y: 10 })).toEqual({ x: -20, y: 20 });
  });

  test("leaves a point already on the grid alone", () => {
    expect(snapPosition({ x: 300, y: 140 })).toEqual({ x: 300, y: 140 });
  });

  test("snapGrid is the dot pattern's step on both axes", () => {
    expect(snapGrid).toEqual([gridSize, gridSize]);
    expect(gridSize).toBe(20);
  });
});
