export type Rgb = [number, number, number];

/** A color split into what it already paints and what it lets through. */
export type Layer = { paint: Rgb; transmit: number };

function draw(ctx: CanvasRenderingContext2D, base: string, color: string): Rgb {
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [(d[0] ?? 0) / 255, (d[1] ?? 0) / 255, (d[2] ?? 0) / 255];
}

/**
 * Let the browser resolve any computed color — oklch, color-mix, alpha — by
 * painting it over black and over white. Over black the canvas holds `a × c`;
 * the gap between the two is `1 - a`, so both halves fall out without parsing
 * a single color string.
 */
export function layerOf(ctx: CanvasRenderingContext2D, color: string): Layer {
  const onBlack = draw(ctx, "#000", color);
  const onWhite = draw(ctx, "#fff", color);
  return {
    paint: onBlack,
    transmit: Math.max(0, Math.min(1, (onWhite[0] ?? 0) - (onBlack[0] ?? 0))),
  };
}

export function flatten(layer: Layer, base: Rgb): Rgb {
  return layer.paint.map((v, i) => v + layer.transmit * (base[i] ?? 0)) as Rgb;
}

/** Walk up the tree until something paints an opaque backdrop, then fold back down. */
export function backdropOf(ctx: CanvasRenderingContext2D, from: Element | null): Rgb {
  const stack: Layer[] = [];
  let node: Element | null = from;
  while (node) {
    const layer = layerOf(ctx, getComputedStyle(node).backgroundColor);
    stack.push(layer);
    if (layer.transmit < 0.005) break;
    node = node.parentElement;
  }
  let base: Rgb = [1, 1, 1];
  for (let i = stack.length - 1; i >= 0; i--) base = flatten(stack[i] as Layer, base);
  return base;
}

function luminance([r, g, b]: Rgb): number {
  const f = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function ratio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function hex([r, g, b]: Rgb): string {
  const to = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
