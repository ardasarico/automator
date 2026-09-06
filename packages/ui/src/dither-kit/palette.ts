// Adapted from Dither Kit by ripgrim: https://www.tripwire.sh/r/avatar.json
// Colour helpers shared by the Dither Kit pieces.

export type Rgb = [number, number, number];

export const rgb = ([r, g, b]: Rgb, k = 1, a = 1) =>
  `rgba(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)},${a})`;
