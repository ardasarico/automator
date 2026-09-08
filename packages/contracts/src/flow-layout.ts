export type FlowPosition = { x: number; y: number };

export const layoutGrid = { columnGap: 300, rowGap: 140, startX: 80, startY: 120 } as const;

type LayoutNode = { id: string };
type LayoutEdge = { source: string; target: string };

/* Longest-path columns, node-order rows. Bound relaxation to |nodes| rounds for cyclic input. */
export function layoutFlowPositions(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
): Map<string, FlowPosition> {
  const depth = new Map<string, number>(nodes.map((node) => [node.id, 0]));
  for (let round = 0; round < nodes.length; round += 1) {
    let changed = false;
    for (const edge of edges) {
      const from = depth.get(edge.source);
      const to = depth.get(edge.target);
      if (from === undefined || to === undefined) continue;
      if (from + 1 > to) {
        depth.set(edge.target, from + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const rows = new Map<number, number>();
  const positions = new Map<string, FlowPosition>();
  for (const node of nodes) {
    const column = depth.get(node.id)!;
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    positions.set(node.id, {
      x: layoutGrid.startX + column * layoutGrid.columnGap,
      y: layoutGrid.startY + row * layoutGrid.rowGap,
    });
  }
  return positions;
}
