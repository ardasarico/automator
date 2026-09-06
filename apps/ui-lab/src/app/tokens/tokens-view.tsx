"use client";

import { useTheme } from "@automator/ui/theme-provider";
import { useCallback, useEffect, useRef, useState } from "react";
import { backdropOf, flatten, hex, layerOf, ratio, type Rgb } from "./contrast";

type Reading = { value: number; fg: string; bg: string };

const textPairs: { id: string; label: string; bg: string; fg: string }[] = [
  { id: "background", label: "background / foreground", bg: "--background", fg: "--foreground" },
  { id: "card", label: "card / card-foreground", bg: "--card", fg: "--card-foreground" },
  {
    id: "popover",
    label: "popover / popover-foreground",
    bg: "--popover",
    fg: "--popover-foreground",
  },
  { id: "accent", label: "accent / accent-foreground", bg: "--accent", fg: "--accent-foreground" },
  { id: "muted", label: "muted / muted-foreground", bg: "--muted", fg: "--muted-foreground" },
];

const brandPairs: { id: string; label: string; bg: string; fg: string }[] = [
  {
    id: "primary",
    label: "primary / primary-foreground",
    bg: "--primary",
    fg: "--primary-foreground",
  },
  {
    id: "secondary",
    label: "secondary / secondary-foreground",
    bg: "--secondary",
    fg: "--secondary-foreground",
  },
];

const statusPairs: { id: string; label: string; bg: string; fg: string }[] = [
  {
    id: "info",
    label: "info-surface / info-foreground",
    bg: "--info-surface",
    fg: "--info-foreground",
  },
  {
    id: "success",
    label: "success-surface / success-foreground",
    bg: "--success-surface",
    fg: "--success-foreground",
  },
  {
    id: "warning",
    label: "warning-surface / warning-foreground",
    bg: "--warning-surface",
    fg: "--warning-foreground",
  },
  {
    id: "destructive-solid",
    label: "destructive / destructive-foreground",
    bg: "--destructive",
    fg: "--destructive-foreground",
  },
  {
    id: "destructive-tint",
    label: "destructive-surface / destructive-text",
    bg: "--destructive-surface",
    fg: "--destructive-text",
  },
];

const builderTextPairs: { id: string; label: string; bg: string; fg: string }[] = [
  { id: "canvas", label: "canvas / foreground", bg: "--canvas", fg: "--foreground" },
  { id: "node", label: "node / card-foreground", bg: "--node", fg: "--card-foreground" },
];

// `threshold: null` marks a token that only has to read as a surface or a
// scrim, where the 3:1 non-text rule does not apply. The ratio is still shown.
const builderMarks: {
  id: string;
  label: string;
  token: string;
  on: string;
  threshold: number | null;
}[] = [
  { id: "node-on-canvas", label: "node", token: "--node", on: "--canvas", threshold: null },
  {
    id: "node-border",
    label: "node-border",
    token: "--node-border",
    on: "--canvas",
    threshold: null,
  },
  {
    id: "node-selected",
    label: "node-selected",
    token: "--node-selected",
    on: "--canvas",
    threshold: 3,
  },
  { id: "edge", label: "edge", token: "--edge", on: "--canvas", threshold: 3 },
  { id: "edge-active", label: "edge-active", token: "--edge-active", on: "--canvas", threshold: 3 },
  {
    id: "canvas-grid",
    label: "canvas-grid",
    token: "--canvas-grid",
    on: "--canvas",
    threshold: null,
  },
  { id: "overlay", label: "overlay", token: "--overlay", on: "--background", threshold: null },
  { id: "chart-1", label: "chart-1", token: "--chart-1", on: "--canvas", threshold: 3 },
  { id: "chart-2", label: "chart-2", token: "--chart-2", on: "--canvas", threshold: 3 },
  { id: "chart-3", label: "chart-3", token: "--chart-3", on: "--canvas", threshold: 3 },
  { id: "chart-4", label: "chart-4", token: "--chart-4", on: "--canvas", threshold: 3 },
  { id: "chart-5", label: "chart-5", token: "--chart-5", on: "--canvas", threshold: 3 },
];

// Written out in full: Tailwind scans source text, so an interpolated class never lands.
const typographyRoles = {
  page: "text-page",
  panel: "text-panel",
  section: "text-section",
  body: "text-body",
  label: "text-label",
  caption: "text-caption",
  code: "font-mono text-code",
};

const radiusSteps = {
  xs: "rounded-xs",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
};

function Ratio({ reading, threshold }: { reading: Reading | undefined; threshold: number | null }) {
  if (!reading) return <span className="font-mono text-caption text-muted-foreground">—</span>;
  const judged = threshold !== null;
  const pass = judged && reading.value >= threshold;
  return (
    <span className="flex items-baseline gap-2 font-mono text-caption tabular-nums">
      <span
        className={
          !judged ? "text-foreground" : pass ? "text-success-foreground" : "text-destructive-text"
        }
      >
        {reading.value.toFixed(2)}:1
      </span>
      <span className="text-muted-foreground">{judged ? `≥${threshold.toFixed(1)}` : "info"}</span>
    </span>
  );
}

export function TokensView() {
  const { resolvedTheme } = useTheme();
  const rootRef = useRef<HTMLDivElement>(null);
  const [readings, setReadings] = useState<Record<string, Reading>>({});
  const [metrics, setMetrics] = useState<Record<string, string>>({});

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const next: Record<string, Reading> = {};

    for (const node of root.querySelectorAll<HTMLElement>("[data-text-pair]")) {
      const id = node.dataset.textPair;
      if (!id) continue;
      const style = getComputedStyle(node);
      const base = backdropOf(ctx, node.parentElement);
      const bg: Rgb = flatten(layerOf(ctx, style.backgroundColor), base);
      const fg: Rgb = flatten(layerOf(ctx, style.color), bg);
      next[id] = { value: ratio(fg, bg), fg: hex(fg), bg: hex(bg) };
    }

    for (const node of root.querySelectorAll<HTMLElement>("[data-mark]")) {
      const id = node.dataset.mark;
      if (!id) continue;
      const base = backdropOf(ctx, node.parentElement);
      const mark: Rgb = flatten(layerOf(ctx, getComputedStyle(node).backgroundColor), base);
      next[id] = { value: ratio(mark, base), fg: hex(mark), bg: hex(base) };
    }

    const sizes: Record<string, string> = {};
    for (const node of root.querySelectorAll<HTMLElement>("[data-metric]")) {
      const id = node.dataset.metric;
      if (!id) continue;
      const style = getComputedStyle(node);
      sizes[id] = id.startsWith("radius")
        ? style.borderTopLeftRadius
        : `${style.fontSize} / ${style.lineHeight} · ${style.fontWeight}`;
    }

    setReadings(next);
    setMetrics(sizes);
  }, []);

  useEffect(() => {
    let stopped = false;
    const run = () => {
      if (!stopped) measure();
    };
    // Measure now, then again once fonts and the theme class have settled. The
    // timer carries the second pass on its own: a background tab never paints,
    // so requestAnimationFrame alone would leave every reading blank.
    run();
    const frame = requestAnimationFrame(run);
    const timer = setTimeout(run, 150);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [measure, resolvedTheme]);

  return (
    <div ref={rootRef} className="grid gap-10">
      <p className="max-w-prose text-caption text-muted-foreground">
        Ratios are measured in the browser from the rendered pixels of the current theme, so
        translucent tokens are composited against whatever sits behind them. Text pairs are held to
        4.5:1, and marks that carry meaning on the canvas to 3:1. Rows marked <code>info</code> are
        surfaces or scrims, where neither rule applies.
      </p>

      {[
        { title: "Surfaces", pairs: textPairs },
        { title: "Primary", pairs: brandPairs },
        { title: "Status", pairs: statusPairs },
        { title: "Builder text", pairs: builderTextPairs },
      ].map(({ title, pairs }) => (
        <section key={title} aria-labelledby={`group-${title}`}>
          <h2 id={`group-${title}`} className="mb-3 text-label">
            {title}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {pairs.map((pair) => (
              <div
                key={pair.id}
                className="flex items-center gap-3 rounded-lg border border-border p-2"
              >
                <span
                  data-text-pair={pair.id}
                  className="grid h-9 w-12 shrink-0 place-items-center rounded-md text-label"
                  style={{ background: `var(${pair.bg})`, color: `var(${pair.fg})` }}
                >
                  Aa
                </span>
                <span className="min-w-0 flex-1 truncate text-caption text-muted-foreground">
                  {pair.label}
                </span>
                <Ratio reading={readings[pair.id]} threshold={4.5} />
              </div>
            ))}
          </div>
        </section>
      ))}

      <section aria-labelledby="group-marks">
        <h2 id="group-marks" className="mb-3 text-label">
          Builder marks
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {builderMarks.map((mark) => (
            <div
              key={mark.id}
              className="flex items-center gap-3 rounded-lg border border-border px-3.5 py-3"
              style={{ background: `var(${mark.on})` }}
            >
              <span
                data-mark={mark.id}
                className="size-6 shrink-0 rounded-md"
                style={{ background: `var(${mark.token})` }}
              />
              <span className="min-w-0 flex-1 truncate text-caption text-muted-foreground">
                {mark.label} on {mark.on.slice(2)}
              </span>
              <Ratio reading={readings[mark.id]} threshold={mark.threshold} />
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="group-type">
        <h2 id="group-type" className="mb-3 text-label">
          Typography
        </h2>
        <div className="grid gap-3">
          {Object.entries(typographyRoles).map(([role, textClass]) => (
            <div
              key={role}
              className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1"
            >
              <span data-metric={`type-${role}`} className={`${textClass} text-foreground`}>
                Simulate the flow before it runs
              </span>
              <span className="font-mono text-caption text-muted-foreground tabular-nums">
                {role} · {metrics[`type-${role}`] ?? "—"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="group-radius">
        <h2 id="group-radius" className="mb-3 text-label">
          Radius
        </h2>
        <div className="flex flex-wrap gap-4">
          {Object.entries(radiusSteps).map(([step, radiusClass]) => (
            <div key={step} className="grid justify-items-center gap-2">
              <span
                data-metric={`radius-${step}`}
                className={`block size-14 border border-border bg-card ${radiusClass}`}
              />
              <span className="font-mono text-caption text-muted-foreground tabular-nums">
                {step} · {metrics[`radius-${step}`] ?? "—"}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
