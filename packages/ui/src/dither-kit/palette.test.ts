import { describe, expect, test } from "bun:test";
import {
  type Rgb,
  type Seed,
  isDitherColor,
  lighten,
  PALETTE,
  seedFromRgb,
  seedOfColor,
} from "./palette";

const midGrey: Rgb = [100, 120, 140];

describe("lighten", () => {
  test("moves every channel a fraction of the way to white", () => {
    expect(lighten([0, 100, 200], 0.5)).toEqual([127.5, 177.5, 227.5]);
  });

  test("leaves the colour untouched at zero", () => {
    expect(lighten(midGrey, 0)).toEqual(midGrey);
  });

  test("reaches white at one", () => {
    expect(lighten(midGrey, 1)).toEqual([255, 255, 255]);
  });

  test("keeps a channel that is already white", () => {
    expect(lighten([255, 0, 0], 0.4)).toEqual([255, 102, 102]);
  });
});

describe("seedFromRgb", () => {
  test("keeps the given colour as the fill", () => {
    expect(seedFromRgb(midGrey).fill).toEqual(midGrey);
  });

  test("derives the line and star as progressively lighter tiers", () => {
    const { fill, line, star } = seedFromRgb(midGrey);
    for (let channel = 0; channel < 3; channel++) {
      expect(line[channel]).toBeGreaterThan(fill[channel] as number);
      expect(star[channel]).toBeGreaterThan(line[channel] as number);
      expect(star[channel]).toBeLessThan(255);
    }
  });
});

describe("seedOfColor", () => {
  test("resolves a palette name to its seed", () => {
    expect(seedOfColor("blue")).toEqual(PALETTE.blue);
  });

  test("passes a token-derived seed through unchanged", () => {
    const seed: Seed = seedFromRgb([12, 34, 56]);
    expect(seedOfColor(seed)).toBe(seed);
  });
});

describe("isDitherColor", () => {
  test("accepts every name the palette defines", () => {
    for (const name of Object.keys(PALETTE)) expect(isDitherColor(name)).toBe(true);
  });

  test("rejects anything that is not a palette name", () => {
    for (const value of ["teal", "", 0, null, undefined, { fill: [0, 0, 0] }])
      expect(isDitherColor(value)).toBe(false);
  });
});

describe("PALETTE", () => {
  test("gives every colour a fill, a line and a star of three channels", () => {
    for (const seed of Object.values(PALETTE))
      for (const tier of [seed.fill, seed.line, seed.star]) {
        expect(tier).toHaveLength(3);
        for (const channel of tier) {
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(255);
        }
      }
  });
});
