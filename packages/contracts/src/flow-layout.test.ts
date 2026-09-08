import { describe, expect, test } from "bun:test";
import { layoutFlowPositions, layoutGrid } from "./flow-layout";

const { columnGap, rowGap, startX, startY } = layoutGrid;

describe("layoutFlowPositions", () => {
  test("columns follow the longest path and rows the node order", () => {
    const positions = layoutFlowPositions(
      [{ id: "t" }, { id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
      [
        { source: "t", target: "a" },
        { source: "t", target: "b" },
        { source: "a", target: "c" },
        { source: "b", target: "c" },
        { source: "t", target: "d" },
        { source: "c", target: "d" },
      ],
    );
    expect(positions.get("t")).toEqual({ x: startX, y: startY });
    expect(positions.get("a")).toEqual({ x: startX + columnGap, y: startY });
    expect(positions.get("b")).toEqual({ x: startX + columnGap, y: startY + rowGap });
    expect(positions.get("c")).toEqual({ x: startX + 2 * columnGap, y: startY });
    expect(positions.get("d")).toEqual({ x: startX + 3 * columnGap, y: startY });
  });

  test("ignores edges to unknown nodes and terminates on cycles", () => {
    const positions = layoutFlowPositions(
      [{ id: "a" }, { id: "b" }],
      [
        { source: "a", target: "b" },
        { source: "b", target: "a" },
        { source: "a", target: "ghost" },
      ],
    );
    expect(positions.size).toBe(2);
    for (const position of positions.values()) expect(Number.isFinite(position.x)).toBe(true);
  });

  test("an empty graph lays out nothing", () => {
    expect(layoutFlowPositions([], []).size).toBe(0);
  });
});
