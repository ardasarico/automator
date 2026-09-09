import { describe, expect, test } from "bun:test";
import type { FlowOutline } from "@automator/contracts";
import { miniatureGeometry, miniatureView, tileView } from "./miniature-geometry";

function outline(nodes: [number, number][], edges: [number, number][] = []): FlowOutline {
  return {
    nodes: nodes.map(([x, y], index) => ({
      id: `n${index}`,
      type: "logic.condition" as const,
      x,
      y,
    })),
    edges: edges.map(([source, target]) => ({ source: `n${source}`, target: `n${target}` })),
  };
}

function inside(box: { x: number; y: number; width: number; height: number }) {
  return (
    box.x >= -0.001 &&
    box.y >= -0.001 &&
    box.x + box.width <= miniatureView.width + 0.001 &&
    box.y + box.height <= miniatureView.height + 0.001
  );
}

describe("miniatureGeometry", () => {
  test("draws nothing for a flow with no nodes", () => {
    expect(miniatureGeometry(outline([]))).toEqual({ boxes: [], wires: [] });
  });

  test("keeps a single node inside the surface and centres it", () => {
    const { boxes } = miniatureGeometry(outline([[1200, -400]]));
    expect(boxes).toHaveLength(1);
    const box = boxes[0]!;
    expect(inside(box)).toBe(true);
    expect(box.x + box.width / 2).toBeCloseTo(miniatureView.width / 2, 5);
    expect(box.y + box.height / 2).toBeCloseTo(miniatureView.height / 2, 5);
  });

  test("fits a long flow inside the surface and shrinks its nodes", () => {
    const short = miniatureGeometry(
      outline([
        [0, 0],
        [300, 0],
      ]),
    );
    const long = miniatureGeometry(
      outline(Array.from({ length: 12 }, (_, index): [number, number] => [index * 300, 0])),
    );
    expect(long.boxes.every(inside)).toBe(true);
    expect(long.boxes[0]!.width).toBeLessThan(short.boxes[0]!.width);
  });

  test("keeps the canvas proportions, so a row stays a row", () => {
    const { boxes } = miniatureGeometry(
      outline([
        [0, 0],
        [300, 0],
        [600, 0],
      ]),
    );
    expect(new Set(boxes.map((box) => box.y.toFixed(5))).size).toBe(1);
    expect(boxes[1]!.x - boxes[0]!.x).toBeCloseTo(boxes[2]!.x - boxes[1]!.x, 5);
  });

  test("wires leave the source's right edge and reach the target's left", () => {
    const { boxes, wires } = miniatureGeometry(
      outline(
        [
          [0, 0],
          [300, 140],
        ],
        [[0, 1]],
      ),
    );
    expect(wires).toHaveLength(1);
    const [from, to] = boxes as [(typeof boxes)[number], (typeof boxes)[number]];
    expect(wires[0]!.d).toStartWith(`M ${from.x + from.width} ${from.y + from.height / 2}`);
    expect(wires[0]!.d).toEndWith(`${to.x} ${to.y + to.height / 2}`);
  });

  test("skips a wire whose ends are not in the outline", () => {
    const broken: FlowOutline = {
      ...outline([[0, 0]]),
      edges: [{ source: "n0", target: "missing" }],
    };
    expect(miniatureGeometry(broken).wires).toEqual([]);
  });
});

describe("tileView", () => {
  test("fits a wide flow inside the tile, where the card view's cap could not", () => {
    const wide = outline([
      [0, 0],
      [300, 0],
      [600, 0],
      [900, 0],
      [1200, 0],
      [1500, 0],
    ]);
    const { boxes } = miniatureGeometry(wide, tileView);
    expect(boxes).toHaveLength(6);
    for (const box of boxes) {
      expect(box.x).toBeGreaterThanOrEqual(-0.001);
      expect(box.y).toBeGreaterThanOrEqual(-0.001);
      expect(box.x + box.width).toBeLessThanOrEqual(tileView.width + 0.001);
      expect(box.y + box.height).toBeLessThanOrEqual(tileView.height + 0.001);
    }
  });

  test("the default view is unchanged, so Flows keeps the geometry it had", () => {
    const shape = outline([
      [0, 0],
      [300, 0],
    ]);
    expect(miniatureGeometry(shape)).toEqual(miniatureGeometry(shape, miniatureView));
  });
});
