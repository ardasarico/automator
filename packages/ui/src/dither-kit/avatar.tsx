// Adapted from Dither Kit by ripgrim: https://www.tripwire.sh/r/avatar.json
"use client";

import { useEffect, useRef } from "react";
import { cn } from "../utils";
import { rgb } from "./palette";
import {
  BAYER4,
  clamp01,
  fnv1a,
  hueFill,
  type PixelBloom,
  pixelBloomStyle,
  pixelPrefersReducedMotion,
  xorshift32,
} from "./pixel";

const GRID = 8;
const CELL_PX = 4;

export type AvatarMirror = "auto" | "horizontal" | "vertical";

export type DitherAvatarProps = {
  name: string;
  hue?: number;
  mirror?: AvatarMirror;
  size?: number;
  bloom?: PixelBloom;
  animate?: boolean;
  animationDuration?: number;
  replayToken?: number;
  className?: string;
};

type AvatarModel = {
  on: boolean[];
  density: number[];
  fill: [number, number, number];
};

/* Always consume every PRNG draw so hue or mirror overrides cannot shift the pattern. */
function avatarModel(
  name: string,
  hueProp: number | undefined,
  mirrorProp: AvatarMirror,
): AvatarModel {
  const rand = xorshift32(fnv1a(name));
  const bits = Array.from({ length: 32 }, () => rand() < 0.5);
  const drawnVertical = rand() < 0.5;
  const drawnHue = Math.floor(rand() * 180) * 2;
  const halfDensity = Array.from({ length: 32 }, () => 0.55 + rand() * 0.45);

  const vertical = mirrorProp === "auto" ? drawnVertical : mirrorProp === "vertical";
  const hue = hueProp ?? drawnHue;

  const on = Array.from({ length: GRID * GRID }, () => false);
  const density = Array.from({ length: GRID * GRID }, () => 0);
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const i = vertical
        ? Math.min(r, GRID - 1 - r) * GRID + c
        : r * (GRID / 2) + Math.min(c, GRID - 1 - c);
      on[r * GRID + c] = bits[i];
      density[r * GRID + c] = halfDensity[i];
    }
  }
  return { on, density, fill: hueFill(hue) };
}

function paintAvatar(
  canvas: HTMLCanvasElement,
  bloomCanvas: HTMLCanvasElement | null,
  model: AvatarModel,
  animate: boolean,
  duration: number,
): (() => void) | undefined {
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  const px = GRID * CELL_PX;
  canvas.width = px;
  canvas.height = px;
  const bloomCtx = bloomCanvas?.getContext("2d") ?? null;
  if (bloomCanvas) {
    bloomCanvas.width = px;
    bloomCanvas.height = px;
  }

  const draw = (progress: number) => {
    ctx.clearRect(0, 0, px, px);
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (!model.on[r * GRID + c]) continue;
        const start = BAYER4[r % 4][c % 4] * 0.7;
        const cellAlpha = clamp01((progress - start) / 0.3);
        if (cellAlpha <= 0) continue;
        const density = model.density[r * GRID + c];
        const base = 0.35 + 0.65 * density;
        for (let py = 0; py < CELL_PX; py++) {
          for (let pxi = 0; pxi < CELL_PX; pxi++) {
            const gx = c * CELL_PX + pxi;
            const gy = r * CELL_PX + py;
            const lit = density > BAYER4[gy & 3][gx & 3];
            const alpha = (lit ? base : base * 0.35) * cellAlpha;
            ctx.fillStyle = rgb(model.fill, 1, alpha);
            ctx.fillRect(gx, gy, 1, 1);
          }
        }
      }
    }
    if (bloomCtx) {
      bloomCtx.clearRect(0, 0, px, px);
      bloomCtx.drawImage(canvas, 0, 0);
    }
  };

  if (!animate || pixelPrefersReducedMotion()) {
    draw(1);
    return undefined;
  }

  let raf = 0;
  const startTime = performance.now();
  const tick = (now: number) => {
    const t = clamp01((now - startTime) / duration);
    draw(1 - (1 - t) ** 3);
    if (t < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

export function DitherAvatar({
  name,
  hue,
  mirror = "auto",
  size,
  bloom = "off",
  animate = true,
  animationDuration = 600,
  replayToken = 0,
  className,
}: DitherAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bloomRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return paintAvatar(
      canvas,
      bloomRef.current,
      avatarModel(name, hue, mirror),
      animate,
      animationDuration,
    );
  }, [name, hue, mirror, animate, animationDuration, replayToken, bloom]);

  const bloomStyle = pixelBloomStyle(bloom);

  return (
    <div
      role="img"
      aria-label={`${name} avatar`}
      className={cn("relative", className)}
      style={size != null ? { width: size, height: size } : undefined}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ imageRendering: "pixelated" }}
      />
      {bloomStyle && (
        <canvas
          ref={bloomRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={bloomStyle}
        />
      )}
    </div>
  );
}
