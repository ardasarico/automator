import type { WatchComparison } from "@automator/contracts";

/**
 * The arithmetic behind the watch triggers. Prices and balances arrive as an integer and a
 * decimal count, never as a JavaScript number: an 18-decimal balance loses precision as a
 * float long before it reaches the threshold. Thresholds are typed as decimal strings and
 * scaled to the same integer basis, so a comparison is an exact bigint comparison.
 */

/** Raised for a watch config the scheduler cannot poll with; the message reaches the log. */
export class WatchConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WatchConfigError";
  }
}

/** One reading: `raw` is the integer the source reports, scaled by `decimals`. */
export interface Reading {
  raw: bigint;
  decimals: number;
}

export function validateDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255)
    throw new WatchConfigError("The reading has an invalid decimal count");
}

/**
 * A decimal string to the integer at `decimals` scale. Extra fraction digits are truncated
 * rather than rounded, which keeps "below" honest: a threshold never grows by rounding.
 */
export function parseDecimal(text: string, decimals: number, field = "threshold"): bigint {
  validateDecimals(decimals);
  const trimmed = text.trim();
  if (trimmed.length > 1024 || !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed))
    throw new WatchConfigError(`The ${field} is not a number: ${text.trim() || "(blank)"}`);
  const negative = trimmed.startsWith("-");
  const [whole = "", fraction = ""] = trimmed.replace("-", "").split(".");
  const padded = (fraction + "0".repeat(decimals)).slice(0, decimals);
  const value = BigInt((whole || "0") + padded);
  return negative ? -value : value;
}

/** The reading as a decimal string, trailing zeroes of the fraction trimmed. */
export function formatDecimal({ raw, decimals }: Reading): string {
  validateDecimals(decimals);
  const negative = raw < BigInt(0);
  const digits = (negative ? -raw : raw).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = decimals > 0 ? digits.slice(digits.length - decimals).replace(/0+$/, "") : "";
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/** Compare at a common scale, preserving threshold digits finer than the source reading. */
export function thresholdMet(
  comparison: WatchComparison,
  reading: Reading,
  threshold: string,
): boolean {
  const thresholdDecimals = threshold.trim().split(".")[1]?.length ?? 0;
  const decimals = Math.max(reading.decimals, thresholdDecimals);
  const scaledThreshold = parseDecimal(threshold, decimals);
  validateDecimals(reading.decimals);
  const value = reading.raw * BigInt(10) ** BigInt(decimals - reading.decimals);
  return comparisonMet(comparison, value, scaledThreshold);
}

/** Whether the reading satisfies the comparison against the threshold, both at the same scale. */
export function comparisonMet(
  comparison: WatchComparison,
  value: bigint,
  threshold: bigint,
): boolean {
  switch (comparison) {
    case "below":
      return value < threshold;
    case "at_or_below":
      return value <= threshold;
    case "above":
      return value > threshold;
    case "at_or_above":
      return value >= threshold;
  }
}

/**
 * Whether this poll starts a run: only the crossing does. A watcher that has never been
 * polled counts as unmet, so a condition already true when the flow is enabled fires once on
 * the first poll; it then stays quiet until the condition goes false and true again.
 */
export function crossed(previous: boolean | undefined, met: boolean): boolean {
  return met && previous !== true;
}
