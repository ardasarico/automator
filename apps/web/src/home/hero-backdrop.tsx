"use client";

import { useTheme } from "@automator/ui/theme-provider";
import { useSyncExternalStore } from "react";
import WebThreads from "../vendor/web-threads/web-threads";
import styles from "./home.module.css";

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

/*
 * Three steps of the blue ramp — the highlight stays blue, or the whole field reads as silver —
 * and the page's own ground, which light mode paints behind the threads.
 */
const tokens = ["--brand", "--blue-300", "--blue-200", "--muted"] as const;
const fallback = ["#3b6f8f", "#7fb4d6", "#a8cde3", "#141619"];

/* One read per theme, kept by reference: the store below must hand back a stable value. */
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
 * shader clears to a transparent buffer, which lets the page's own background show through and
 * keeps one component serving both themes.
 */
export function HeroBackdrop() {
  const { resolvedTheme } = useTheme();
  const light = resolvedTheme === "light";
  /* The page renders on the server, where no palette can be read; the browser reads it and the
   * threads only ever reach WebGL, so the two passes cannot disagree about any markup. */
  const [brand, bright, ink, ground] = useSyncExternalStore(
    subscribe,
    () => coloursFor(resolvedTheme ?? "dark"),
    () => fallback,
  );
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <WebThreads
        color1={brand ?? fallback[0]!}
        color2={bright ?? fallback[1]!}
        color3={ink ?? fallback[2]!}
        speed={0.3}
        threadCount={8}
        frequency={7.5}
        spread={0.2}
        taper={0.6}
        // The shader measures from the bottom, and the prompt sits at 53% from the top.
        position={0.47}
        fanMode="center"
        glow={0.03}
        falloff={0.6}
        thickness={1.25}
        brightness={0.8}
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
      <span className={styles.scrim} />
    </div>
  );
}
