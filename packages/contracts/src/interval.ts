/**
 * Schedule intervals, as the Every field writes them: a whole number and a unit, such as 1h.
 *
 * The builder, the settings panel and the scheduler all read intervals through here, so an
 * interval the builder accepts is one the scheduler can actually fire on. A unit is required:
 * a bare number has no obvious meaning, and guessing one silently turns "30" into half an hour.
 */

export const intervalUnits = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;
export type IntervalUnit = keyof typeof intervalUnits;

/** The accepted forms, written for descriptions and problem messages. */
export const intervalFormats = "30s, 15m, 1h or 7d";

/** What a schedule trigger runs at until someone changes it. */
export const defaultInterval = "1h";

const intervalPattern = /^\s*(\d+)\s*([smhd])\s*$/i;
const zeroPattern = /^\s*0+\s*[smhd]?\s*$/i;

/** The interval in milliseconds, or null when the text is not one this scheduler can fire on. */
export function parseInterval(text: string): number | null {
  const match = intervalPattern.exec(text);
  if (!match) return null;
  const unit = intervalUnits[match[2]!.toLowerCase() as IntervalUnit];
  const milliseconds = Number(match[1]) * unit;
  return Number.isSafeInteger(milliseconds) && milliseconds > 0 ? milliseconds : null;
}

/**
 * Why the text cannot be used as an interval, as a phrase that completes a sentence about the
 * node ("“Every hour” has no interval, so it never fires."), or null when it parses.
 */
export function intervalProblem(text: string): string | null {
  if (parseInterval(text) !== null) return null;
  const shown = text.trim();
  const fix = `Use a whole number and a unit: ${intervalFormats}.`;
  if (!shown) return `has no interval, so it never fires. ${fix}`;
  if (zeroPattern.test(shown)) return `has an interval of zero, so it never fires. ${fix}`;
  if (/^\d+$/.test(shown))
    return `has an interval with no unit ("${shown}"), so it never fires. ${fix}`;
  return `has an interval the scheduler cannot read ("${shown}"), so it never fires. ${fix}`;
}
