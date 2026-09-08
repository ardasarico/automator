import type { WatchComparison } from "@automator/contracts";

export class WatchConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WatchConfigError";
  }
}

export interface Reading {
  raw: bigint;
  decimals: number;
}

export function validateDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255)
    throw new WatchConfigError("The reading has an invalid decimal count");
}

/* Truncate excess fractional digits so rounding never raises a threshold. */
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

export function formatDecimal({ raw, decimals }: Reading): string {
  validateDecimals(decimals);
  const negative = raw < BigInt(0);
  const digits = (negative ? -raw : raw).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = decimals > 0 ? digits.slice(digits.length - decimals).replace(/0+$/, "") : "";
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

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

export function crossed(previous: boolean | undefined, met: boolean): boolean {
  return met && previous !== true;
}
