// Adapted from Dither Kit by ripgrim: https://www.tripwire.sh/dither-kit
"use client";

import { useChartPart } from "./chart-context";

/**
 * Value labels down the left edge. The tick count is the root's `yTickCount`, not a prop:
 * the domain was niced for that count, so any other would end short of the top gridline.
 */
export function YAxis({
  tickFormatter,
  tickMargin = 8,
}: {
  tickFormatter?: (value: number) => string;
  tickMargin?: number;
}) {
  const ctx = useChartPart("YAxis");
  if (!ctx.ready) return null;

  return (
    <g className="fill-current font-mono text-[10px] text-muted-foreground">
      {ctx.y.ticks(ctx.yTickCount).map((t) => (
        <text
          key={t}
          x={-tickMargin}
          y={ctx.y(t)}
          textAnchor="end"
          dominantBaseline="central"
          fill="currentColor"
        >
          {tickFormatter ? tickFormatter(t) : t}
        </text>
      ))}
    </g>
  );
}
