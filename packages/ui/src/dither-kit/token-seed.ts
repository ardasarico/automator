"use client";

import { useEffect, useState } from "react";
import { type Rgb, type Seed, seedFromRgb } from "./palette";

/**
 * The canvas paints concrete pixels, so a chart that wants the design system's colours has to
 * resolve them first: read the custom property, then let the browser convert whatever colour
 * space it is written in — the tokens are oklch — by painting one pixel and reading it back.
 */
function resolveRgb(token: string): Rgb | null {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  if (value === "") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.fillStyle = "#000";
  context.fillStyle = value;
  /* An unparseable colour leaves fillStyle at the previous value, which would paint black. */
  if (context.fillStyle === "#000000") return null;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return r === undefined || g === undefined || b === undefined ? null : [r, g, b];
}

function resolveAll(tokens: Record<string, string>): Record<string, Seed> {
  const seeds: Record<string, Seed> = {};
  for (const [key, token] of Object.entries(tokens)) {
    const rgb = resolveRgb(token);
    if (rgb) seeds[key] = seedFromRgb(rgb);
  }
  return seeds;
}

/**
 * Series seeds built from CSS custom properties, re-read when the theme changes. Pass the
 * token names by series key (`{ failed: "--destructive-text" }`); the first render is
 * server-safe and returns nothing, so give every series a fallback colour in its config.
 */
export function useTokenSeeds(tokens: Record<string, string>): Record<string, Seed> {
  const [seeds, setSeeds] = useState<Record<string, Seed>>({});
  /* The tokens are a literal at every call site; the keys are what identifies them. */
  const identity = JSON.stringify(tokens);
  useEffect(() => {
    const read = () => setSeeds(resolveAll(JSON.parse(identity) as Record<string, string>));
    read();
    /* Both ways the theme can change: the class the provider stamps, and the OS setting. */
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributeFilter: ["class", "style"] });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", read);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", read);
    };
  }, [identity]);
  return seeds;
}
