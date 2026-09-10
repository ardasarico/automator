"use client";

import { useTheme } from "@automator/ui/theme-provider";
import { useEffect, useState, useSyncExternalStore } from "react";
import WebThreads from "../vendor/web-threads/web-threads";

/**
 * The shader wants hex, the palette is written in oklch, and computed styles hand oklch back
 * verbatim. Painting one pixel and reading it converts any colour the browser understands, so
 * the threads follow the tokens instead of carrying a second copy of the brand blue.
 */
function readTokens(names: readonly string[]): string[] | null {
  const swatch = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!swatch) return null;
  swatch.canvas.width = 1;
  swatch.canvas.height = 1;
  const probe = document.createElement("span");
  probe.style.display = "none";
  document.body.append(probe);
  try {
    return names.map((name) => {
      probe.style.color = `var(${name})`;
      swatch.fillStyle = getComputedStyle(probe).color;
      swatch.fillRect(0, 0, 1, 1);
      const [r, g, b] = swatch.getImageData(0, 0, 1, 1).data;
      return `#${[r ?? 0, g ?? 0, b ?? 0].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
    });
  } finally {
    probe.remove();
  }
}

const tokens = ["--brand", "--blue-300", "--blue-200", "--muted"] as const;
const fallback = ["#3b6f8f", "#7fb4d6", "#a8cde3", "#141619"];

const readings = new Map<string, string[]>();
function coloursFor(theme: string): string[] {
  const known = readings.get(theme);
  if (known) return known;
  const read = readTokens(tokens) ?? fallback;
  readings.set(theme, read);
  return read;
}
const subscribe = () => () => {};

/**
 * Decoration behind the prompt and nothing else, so it is hidden from assistive technology. The
 * workspace lays a scrim over its copy of this field; the landing does not — the threads are the
 * page's first impression and are meant to be seen flat. The headline carries its own shadow.
 *
 * The landing's first paint must be the headline, not a WebGL context: the shader is mounted one
 * frame later, and a visitor who asked for less motion never loads it at all.
 */
export function HeroBackdrop() {
  const { resolvedTheme } = useTheme();
  const light = resolvedTheme === "light";
  const [brand, bright, ink, ground] = useSyncExternalStore(
    subscribe,
    () => coloursFor(resolvedTheme ?? "dark"),
    () => fallback,
  );
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const frame = requestAnimationFrame(() => setRunning(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[calc(100%+220px)] [mask-image:linear-gradient(to_bottom,#000_0%,#000_62%,transparent_100%)]"
      aria-hidden="true"
    >
      {running && (
        <WebThreads
          color1={brand ?? fallback[0]!}
          color2={bright ?? fallback[1]!}
          color3={ink ?? fallback[2]!}
          speed={0.3}
          threadCount={8}
          frequency={7.5}
          spread={0.2}
          taper={0.6}
          position={0.47}
          fanMode="center"
          glow={0.015}
          falloff={0.6}
          thickness={1.25}
          brightness={0.7}
          opacity={1}
          mirror
          shimmer={false}
          grain={false}
          grainIntensity={0}
          mouseInteraction={false}
          mouseStrength={0}
          lightMode={light}
          backgroundColor={ground ?? fallback[3]!}
        />
      )}
      {/* Not the workspace's scrim: this only lets the field settle into the page at the edges,
          so the corners stop competing with the headline. Many stops, none of them visible. */}
      <span className="absolute inset-0 bg-[radial-gradient(120%_92%_at_50%_50%,transparent_0%,transparent_38%,color-mix(in_srgb,var(--background)_14%,transparent)_58%,color-mix(in_srgb,var(--background)_38%,transparent)_76%,color-mix(in_srgb,var(--background)_66%,transparent)_92%,var(--background)_100%)]" />
    </div>
  );
}
