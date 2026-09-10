import type { XYPosition } from "@xyflow/react";

/** The canvas dot pattern, and the step every node position rounds to. */
export const gridSize = 20;

export const snapGrid: [number, number] = [gridSize, gridSize];

/** Rounds a flow position to the nearest grid point, so placed nodes line up with dragged ones. */
export function snapPosition(position: XYPosition): XYPosition {
  return {
    x: Math.round(position.x / gridSize) * gridSize,
    y: Math.round(position.y / gridSize) * gridSize,
  };
}
