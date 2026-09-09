import type { FlowOutline } from "@automator/contracts";

/* The canvas node as the miniature models it: the real 240px width and a typical header height. */
const nodeWidth = 240;
const nodeHeight = 64;

/** The drawing surface. Cards render it through `preserveAspectRatio`, so these are its units. */
export const miniatureView = { width: 320, height: 112, padding: 12 } as const;

/* A two-node flow would otherwise fill the frame and read as a big one, so the fit is capped. */
const maxScale = 0.26;

export type MiniatureBox = {
  id: string;
  type: FlowOutline["nodes"][number]["type"];
  x: number;
  y: number;
  width: number;
  height: number;
};
export type MiniatureWire = { id: string; d: string };
export type MiniatureGeometry = { boxes: MiniatureBox[]; wires: MiniatureWire[] };

/**
 * Places a flow's stored positions on the miniature surface. The scale is uniform, so the
 * drawing keeps the proportions of the canvas it came from: a wide flow stays wide, and a
 * flow with more nodes draws them smaller.
 */
export function miniatureGeometry(outline: FlowOutline): MiniatureGeometry {
  if (outline.nodes.length === 0) return { boxes: [], wires: [] };
  const xs = outline.nodes.map((node) => node.x);
  const ys = outline.nodes.map((node) => node.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) + nodeWidth - minX;
  const spanY = Math.max(...ys) + nodeHeight - minY;
  const scale = Math.min(
    (miniatureView.width - miniatureView.padding * 2) / spanX,
    (miniatureView.height - miniatureView.padding * 2) / spanY,
    maxScale,
  );
  const offsetX = (miniatureView.width - spanX * scale) / 2 - minX * scale;
  const offsetY = (miniatureView.height - spanY * scale) / 2 - minY * scale;
  const boxes = outline.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    x: node.x * scale + offsetX,
    y: node.y * scale + offsetY,
    width: nodeWidth * scale,
    height: nodeHeight * scale,
  }));
  const byId = new Map(boxes.map((box) => [box.id, box]));
  const wires: MiniatureWire[] = [];
  outline.edges.forEach((edge, index) => {
    const from = byId.get(edge.source);
    const to = byId.get(edge.target);
    if (!from || !to) return;
    /* Out of the source's right edge and into the target's left, as the canvas wires them. */
    const x1 = from.x + from.width;
    const y1 = from.y + from.height / 2;
    const x2 = to.x;
    const y2 = to.y + to.height / 2;
    const bend = Math.max(8, (x2 - x1) * 0.45);
    wires.push({
      id: `${edge.source}-${edge.target}-${index}`,
      d: `M ${x1} ${y1} C ${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}`,
    });
  });
  return { boxes, wires };
}
