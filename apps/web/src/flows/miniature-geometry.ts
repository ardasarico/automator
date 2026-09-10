import type { FlowOutline } from "@automator/contracts";

/* The canvas node as the miniature models it: the real 240px width and a typical header height. */
const nodeWidth = 240;
const nodeHeight = 64;

export type MiniatureView = {
  width: number;
  height: number;
  padding: number;
  /* A two-node flow would otherwise fill the frame and read as a big one, so the fit is capped. */
  maxScale: number;
  /*
   * A floor on how short a node may be drawn, in view units. Fitting a wide flow into a small
   * frame makes every node a hairline — true to scale, and unreadable. Where the drawing is a
   * silhouette rather than a diagram, the floor trades exact proportion for something you can
   * see. Zero leaves the geometry honest.
   */
  minNodeHeight: number;
};

/** The drawing surface. Cards render it through `preserveAspectRatio`, so these are its units. */
export const miniatureView: MiniatureView = {
  width: 320,
  height: 112,
  padding: 12,
  maxScale: 0.26,
  minNodeHeight: 0,
};

/*
 * The tile a marketplace row card carries. A wide flow cannot survive the card view's cap at this
 * size, so the tile lifts it: here the fit itself is the limit, and the flow reads as a silhouette
 * rather than a graph.
 */
export const tileView: MiniatureView = {
  width: 160,
  height: 104,
  padding: 8,
  maxScale: 1,
  minNodeHeight: 11,
};

type MiniatureBox = {
  id: string;
  type: FlowOutline["nodes"][number]["type"];
  x: number;
  y: number;
  width: number;
  height: number;
};
type MiniatureWire = { id: string; d: string };
export type MiniatureGeometry = { boxes: MiniatureBox[]; wires: MiniatureWire[] };

/**
 * Places a flow's stored positions on the miniature surface. The scale is uniform, so the
 * drawing keeps the proportions of the canvas it came from: a wide flow stays wide, and a
 * flow with more nodes draws them smaller.
 */
export function miniatureGeometry(
  outline: FlowOutline,
  view: MiniatureView = miniatureView,
): MiniatureGeometry {
  if (outline.nodes.length === 0) return { boxes: [], wires: [] };
  const xs = outline.nodes.map((node) => node.x);
  const ys = outline.nodes.map((node) => node.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) + nodeWidth - minX;
  const spanY = Math.max(...ys) + nodeHeight - minY;
  const scale = Math.min(
    (view.width - view.padding * 2) / spanX,
    (view.height - view.padding * 2) / spanY,
    view.maxScale,
  );
  const offsetX = (view.width - spanX * scale) / 2 - minX * scale;
  const offsetY = (view.height - spanY * scale) / 2 - minY * scale;
  const drawnHeight = Math.max(nodeHeight * scale, view.minNodeHeight);
  /* The floor grows a node about its middle, so a row of them stays on the line it was on. */
  const lift = (drawnHeight - nodeHeight * scale) / 2;
  const boxes = outline.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    x: node.x * scale + offsetX,
    y: node.y * scale + offsetY - lift,
    width: nodeWidth * scale,
    height: drawnHeight,
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
