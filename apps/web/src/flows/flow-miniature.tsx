import type { FlowNodeType, FlowOutline } from "@automator/contracts";
import { getCatalogEntry, type FlowNodeCategory } from "../builder/catalog";
import styles from "./flow-miniature.module.css";
import { miniatureGeometry, miniatureView } from "./miniature-geometry";

/* The canvas colours node icons by category; the miniature repeats that mapping, so a card
 * and the flow it opens say the same thing. */
const categoryChart: Record<FlowNodeCategory, string> = {
  trigger: "var(--chart-1)",
  onchain: "var(--chart-2)",
  integration: "var(--chart-2)",
  ai: "var(--chart-3)",
  logic: "var(--chart-4)",
  notify: "var(--chart-4)",
  data: "var(--chart-5)",
  screen: "var(--chart-5)",
};

function chartColor(type: FlowNodeType) {
  return categoryChart[getCatalogEntry(type).category];
}

/**
 * A flow's real shape, drawn from its stored node positions, so every card in the list is
 * distinguishable instead of repeating one generic glyph.
 */
export function FlowMiniature({ outline, label }: { outline: FlowOutline; label?: string }) {
  const { boxes, wires } = miniatureGeometry(outline);
  return (
    <svg
      viewBox={`0 0 ${miniatureView.width} ${miniatureView.height}`}
      preserveAspectRatio="xMidYMid meet"
      /* Without a label it is decoration beside text that already names the flow. */
      {...(label === undefined ? { "aria-hidden": true } : { role: "img", "aria-label": label })}
      className={styles.miniature}
    >
      {wires.map((wire) => (
        <path key={wire.id} d={wire.d} className={styles.wire} />
      ))}
      {boxes.map((box) => (
        <rect
          key={box.id}
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          rx={2}
          className={styles.node}
          style={{ "--node-chart": chartColor(box.type) } as React.CSSProperties}
        />
      ))}
    </svg>
  );
}
