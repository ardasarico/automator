"use client";

import type { RunStatsDay } from "@automator/contracts";
import {
  Bar,
  BarChart,
  Grid,
  Tooltip,
  XAxis,
  YAxis,
  type ChartConfig,
  useTokenSeeds,
} from "@automator/ui/dither-chart";
import { useMemo } from "react";
import styles from "./runs-chart.module.css";

/* Outcome is a status, not an identity: each series wears the token its badge already wears,
 * and the legend names it, so the chart never says anything by colour alone. */
const tokens = {
  succeeded: "--success-foreground",
  failed: "--destructive-text",
  waiting: "--warning-foreground",
};

const labels: Record<keyof typeof tokens, string> = {
  succeeded: "Succeeded",
  failed: "Failed",
  waiting: "Waiting",
};

/* Named hues until the tokens resolve on the client, so the first paint is never black. */
const fallbacks = { succeeded: "green", failed: "red", waiting: "orange" } as const;

const dayLabel = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

export function RunsChart({ days }: { days: readonly RunStatsDay[] }) {
  const seeds = useTokenSeeds(tokens);
  const config = useMemo<ChartConfig>(
    () => ({
      succeeded: { label: labels.succeeded, color: seeds.succeeded ?? fallbacks.succeeded },
      failed: { label: labels.failed, color: seeds.failed ?? fallbacks.failed },
      waiting: { label: labels.waiting, color: seeds.waiting ?? fallbacks.waiting },
    }),
    [seeds],
  );
  /* The chart carries a copy it can mutate freely, and one the axis can read dates off. */
  const data = useMemo(() => days.map((day) => ({ ...day })), [days]);

  return (
    <div className={styles.plot}>
      <BarChart
        data={data}
        config={config}
        stackType="stacked"
        /* Room on the left for the count scale, which is drawn outside the plot area. */
        margins={{ top: 12, right: 6, bottom: 24, left: 30 }}
        className={styles.chart}
      >
        <Grid />
        <Bar dataKey="succeeded" />
        <Bar dataKey="failed" />
        <Bar dataKey="waiting" />
        <Tooltip
          labelKey="date"
          valueFormatter={(value, name) =>
            `${value} ${labels[name as keyof typeof labels] ?? name}`
          }
        />
        {/* Runs are whole numbers, so a tick between two of them would name a count that
            cannot happen; the scale is what tells a tall bar from a slightly taller one. */}
        <YAxis
          tickCount={4}
          tickFormatter={(value) => (Number.isInteger(value) ? `${value}` : "")}
        />
        <XAxis
          dataKey="date"
          maxTicks={7}
          tickFormatter={(value) =>
            typeof value === "string" ? dayLabel.format(new Date(`${value}T00:00:00Z`)) : ""
          }
        />
      </BarChart>
    </div>
  );
}
